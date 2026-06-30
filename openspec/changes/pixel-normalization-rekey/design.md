# Design: Pixel Normalization & Leads Re-key (Change A)

## Context and Objective

Normalize the inline Meta pixel (`Landing.metaPixelId` number + `Landing.metaAccessToken`) into a first-class `MetaPixel` table reusable across landings, re-key the live leads path from pixel-number to **`landingId` only**, and make `whatsappMessages` per-landing editable. All legacy landings move to the embed, so there is **no permanent compat code**: routing flips in one **hard cutover** (no dual-accept shim). Schema migration stays expand/contract for DB safety.

**Attribution-consistency fix (override of prior "minor drift" acceptance):** the two CAPI events of one lead (`Lead` at create, `Contact` hours later on WhatsApp inbound) previously resolved pixel+token live via `Lead → Landing → MetaPixel`. If an admin reassigned the landing's pixel between the two events, they split across pixels. We now **snapshot pixel + source URL onto the `Lead` at create time**; both events dispatch from that snapshot, immune to later landing edits.

## New Data Model (Prisma — final/contracted state)

```prisma
model MetaPixel {
  id          String    @id @default(uuid())
  pixelId     String    @unique          // Meta pixel NUMBER (e.g. "976916338006290")
  accessToken String                     // server-side secret — never serialized
  label       String?
  landings    Landing[]
  leads       Lead[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model Landing {
  id               String        @id @default(uuid())
  url              String                       // stays NON-unique (Decision 3)
  metaPixelId      String                       // FK → MetaPixel.id (shareable, no @unique)
  metaPixel        MetaPixel     @relation(fields: [metaPixelId], references: [id], onDelete: Restrict)
  whatsappMessages String[]      @default([])
  status           LandingStatus @default(ACTIVE)
}

model Lead {
  metaPixelId    String        // FK → MetaPixel.id — pixel SNAPSHOT at create time
  metaPixel      MetaPixel @relation(fields: [metaPixelId], references: [id], onDelete: Restrict)
  eventSourceUrl String        // snapshot of Landing.url at create time
  landingId      String        // canonical routing key — NOT NULL after tighten
  landing        Landing @relation(fields: [landingId], references: [id])
  @@index([landingId])
}
```

Naming (idiomatic Prisma): `Landing.metaPixelId` and `Lead.metaPixelId` are both **uuid FKs → `MetaPixel.id`** with relation `metaPixel`. The pixel **number** lives only at `MetaPixel.pixelId`; reads are `landing.metaPixel.pixelId` / `lead.metaPixel.pixelId`. No raw-number column on `Lead` (option A) — history is preserved by `onDelete: Restrict`.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|----------|--------|----------|-----------|
| Leads routing key | **`landingId` only**, end-to-end | Pixel-number routing or dual-accept shim | All landings move to embed; pixel number is no longer unique once shared — only `landingId` routes precisely. |
| `Lead.landingId` | Required (NOT NULL after tighten) | Nullable / derive from pixel | Load-bearing: deficit count keys the balancer per landing; shared pixels would conflate. Balancing **unchanged**. |
| `Lead.metaPixelId` | **FK → MetaPixel.id, snapshot at create** (option A: no raw-number column) | Raw pixel-number snapshot / resolve live | Pins both CAPI events of a lead to one pixel; `Restrict` keeps history without an extra column. |
| `Lead.eventSourceUrl` | New string column, snapshot of `Landing.url` at create | Resolve live from landing | `event_source_url` stays consistent across `Lead`/`Contact` even if the landing URL changes. |
| CAPI source of truth | Resolve `pixelId`+`accessToken` from **`lead.metaPixel`**, url from **`lead.eventSourceUrl`** | `getLandingByMetaPixelId` / `lead.landing.metaPixel` (live) | Same pixel/token/url for both events of a lead; immune to later landing pixel/url changes; token never reaches client. |
| Pixel sharing | Shareable across landings from day 1 | Confirm-gate | Routing is by `landingId`; sharing is never ambiguous. |
| Changing a landing's pixel | **Reassign the landing FK to ANOTHER `MetaPixel` row** | Edit `pixelId` in-place on the existing row | In-flight leads are pinned to a `MetaPixel.id`; editing that row's `pixelId` would retro-change their attribution. Treat `MetaPixel.pixelId` as **quasi-immutable**. |
| `whatsappMessages` storage | `String[]` on `Landing` | Separate table | Small, ordered, whole-list-replaced; atomic to PUT, join-free. |

## Re-key Data Flow (post-cutover)

```
POST /api/leads { landingId, fbc?, fbp?, userAgent }      ← metaPixelId NO longer sent by client
        │  zod: landingId required
        ▼
createLead(landingId) ──► selectCashierNumberForLanding(landingId)  [deficit count by landingId]
        ▼
getLandingById(landingId) → { metaPixelId (FK), url }
        ▼
saveLead({ landingId, metaPixelId: landing.metaPixelId /*FK snapshot*/,
           eventSourceUrl: landing.url /*snapshot*/, … }, include:{ metaPixel:true })
        ▼
dispatch Lead ──► lead.metaPixel.{pixelId,accessToken} + lead.eventSourceUrl   (CAPI)
        ⋮ (hours later, WhatsApp inbound)
getLeadByCode(code) include:{ metaPixel:true }  →  dispatch Contact ──► SAME snapshot
```

Both dispatches read **`lead.metaPixel`** + **`lead.eventSourceUrl`** — never the live landing. `conversion.ts` is unchanged (it already takes `metaPixelId` number + `metaAccessToken` + `eventSourceUrl`); only the resolution source in `service.ts` moves to the lead snapshot. `getLandingByMetaPixelId` becomes unused by the leads dispatch.

## Leads Endpoint Contract (`POST /api/leads`)

| Condition | Status | Body |
|-----------|--------|------|
| `landingId` missing/empty (zod fail) | **400** | `{ message: 'Invalid body data', details }` |
| `landingId` does not exist | **404** | `{ message: 'Landing not found' }` |
| Landing `DISABLED` | **404** | `{ message: 'Landing not found or disabled' }` |
| Duplicate `fbc` | 409 | unchanged |
| Fallback invariant violation | 500 | unchanged |
| Success | 201 | `{ code, number }` |

DISABLED → **404** (not 403): avoids leaking landing existence on the public endpoint.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `worker/prisma/schema.prisma` | Modify | Add `MetaPixel`; `Landing.metaPixelId` FK + `whatsappMessages`; `Lead.metaPixelId`→FK (`Restrict`) + `Lead.eventSourceUrl` + `Lead.landingId`; drop old scalars at contract |
| `worker/src/integrations/leads/service.ts` | Modify | `CreateLeadPayloadSchema`→`landingId`; resolve landing once, pass `metaPixelId`(FK)+`eventSourceUrl` snapshots to `saveLead`; both dispatches read `lead.metaPixel`+`lead.eventSourceUrl` (drop `getLandingByMetaPixelId`); `mapLeadCodeToPhone` passes the snapshot fields |
| `worker/src/integrations/leads/http.ts` | Modify | Drop `metaPixelId` label; 400 on missing `landingId` |
| `worker/src/integrations/leads/conversion.ts` | None (verify) | Already takes `{pixelId, accessToken, eventSourceUrl}` per call — no change |
| `worker/src/persistence/repositories/leadsRepository.ts` | Modify | `…ByMetaPixelId`→`…ByLandingId`; `saveLead` writes `landingId`+`metaPixelId`(FK)+`eventSourceUrl` and `include:{metaPixel:true}`; `getLeadByCode` adds `include:{metaPixel:true}` (selects `eventSourceUrl`) |
| `worker/src/modules/admin/admin.repository.ts` | Modify | `getLandingById` (nested pixel + url); MetaPixel CRUD; keep/repoint `getLandingByMetaPixelId` only if still used elsewhere |
| `worker/src/modules/admin/` (service/controller/routes/zod) | Modify | MetaPixel CRUD (token masked); Landing form: FK selector + `whatsappMessages`; delete-pixel blocked by `Restrict` (friendly error) |
| `dashboard/src/types/domain.ts`, `admin-landings-page.tsx`, `admin-hooks` | Modify | `MetaPixel` type; pixel `Select` (shareable, no gate); messages editor |

## Migration / Rollout — HARD CUTOVER (expand → cutover → contract)

DDL is expand/contract; the **routing flip is hard**. Transitional column names avoid colliding the old scalar with the new FK (same pattern as `Landing`).

1. **Expand (additive, ships with current code):**
   - Create `MetaPixel`; one row per distinct `(metaPixelId, accessToken)` of current landings.
   - Add nullable `Landing.metaPixelRef`(FK), `Landing.whatsappMessages`.
   - Add nullable `Lead.metaPixelRef`(FK→`MetaPixel.id`), `Lead.eventSourceUrl`, `Lead.landingId`.
   - **Backfill Landing:** set `metaPixelRef` from the matching `MetaPixel`.
   - **Backfill Lead (incl. in-flight `NOT_CONTACTED`):** map each lead's old `metaPixelId` number → the `MetaPixel` row with that `pixelId` → set `metaPixelRef`; set `landingId` and `eventSourceUrl` from the `Landing` that historically owned that pixel (1:1 today via `@unique`, unambiguous). This guarantees a future `Contact` for an in-flight lead fires on the backfilled snapshot.
   - Worker **still routes by `metaPixelId` number** here — old behavior intact.
2. **Coordinated cutover (short window):** deploy the `landingId`-only worker + the embed (Change B) + swap **ALL** landings at once. From here routing is by `landingId`; dispatches read the lead snapshot.
3. **Tighten + Contract:**
   - Set `Landing.metaPixelRef`, `Lead.metaPixelRef`, `Lead.eventSourceUrl`, `Lead.landingId` NOT NULL; FKs `onDelete: Restrict`.
   - Drop `Landing.metaAccessToken`, the old scalar `Landing.metaPixelId`(+`@unique`), and the old scalar number column on `Lead`.
   - Rename `metaPixelRef → metaPixelId` on both `Landing` and `Lead` (rename only after the old scalar is dropped — names cannot coexist).

Deploy-order guard: keep `POST /api/leads` and inbound processing functional throughout — old columns persist until Contract, so the pre-cutover build keeps working and rollback stays clean.

## A ↔ B Coupling

The hard worker flip requires Change B to exist and every active landing already swapped. A and B are specified separately but **deployed together** in the cutover window.

## Testing Strategy (TDD)

| Layer | What | Approach |
|-------|------|----------|
| Unit | `CreateLeadPayloadSchema`: requires `landingId`, rejects missing | schema tests |
| Unit | HTTP: missing `landingId`→400; unknown/DISABLED→404 | adapt `http.test.ts` |
| Unit | re-keyed `selectCashierNumberForLandingWithDependencies(landingId)` | swap deps to `…ByLandingId` |
| Unit | deficit count by `landingId` does **not** conflate shared-pixel landings | two landings, one pixel → separate counts |
| Unit | **Snapshot immunity (critical):** create lead; reassign the landing's pixel; fire `Contact` → `Contact` uses the lead's snapshot `pixelId`/`accessToken`/`eventSourceUrl` (= create-time), NOT the new pixel. Same for token rotation on the same pixel row (snapshot reads live token off the pinned `MetaPixel` row — assert pin, not value drift). | mock `getLeadByCode` w/ `metaPixel`; assert pair+url from lead |
| Unit | Both dispatches read `lead.metaPixel`+`lead.eventSourceUrl`; token never in any DTO | assert source + no leak |
| Integration (real DB) | Expand backfill: MetaPixel dedup; `Landing`/`Lead` FK set; `Lead.eventSourceUrl`+`landingId` populated incl. `NOT_CONTACTED`; idempotent | follow `migration-*.test.ts` |
| Migration | `migration-pixel-normalization.test.ts`: expand→backfill(Landing+Lead)→tighten→contract drop/rename | mirror `migration-meta-conversions.test.ts` |
| Admin | MetaPixel CRUD; landing form writes FK+messages; token masked; `Restrict` blocks delete | service + controller tests |

## Risks & Rollback

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A landing not swapped in the cutover window → its leads silently cut | **High** | Pre-flip swap checklist: every `ACTIVE` landing's embed deployed+reachable before flipping; short window, one pass. |
| Lead backfill maps a lead to the wrong pixel/url (e.g. mid-backfill pixel edit) | Med | Freeze landing pixel edits during backfill; backfill idempotent/re-runnable; assert 1:1 `pixelId`→`Landing` holds pre-cutover. |
| **Split attribution across the two CAPI events** | **Mitigated by design** | Both events read the `Lead` snapshot (`metaPixel` FK + `eventSourceUrl`); landing edits after create no longer affect them. |
| Editing `MetaPixel.pixelId` in-place retro-changes in-flight leads pinned to that row | Med | Treat `pixelId` as immutable; "change a landing's pixel" = **reassign the landing FK to another row**, never edit the number in-place. Document in admin UX. |
| `onDelete: Restrict` blocks deleting a referenced pixel | Low | Deleting a pixel requires re-pointing/archiving its landings & leads first; admin surfaces a friendly block + guidance. |

**Rollback:** Expand DDL is additive — redeploy prior code, leave columns. Cutover is the real point of no easy return: if leads break, roll the worker back to the pixel-routing build (present until Tighten/Contract) and revert snippets. Contract is irreversible-without-restore — run only post-verify with a DB backup.

## Open Questions (closed)

- [x] `whatsappMessages` zod caps — **Decision**: trim each entry; discard empty/whitespace-only; cap at **5 messages**; max **250 characters** per message. Violations return 400. Codified in `specs/landing/spec.md`.
- [x] Admin UX for `MetaPixel` guards — **Decision**: reference-based guard table. `accessToken`/`label` always editable. `pixelId` editable only when no leads reference the row. Delete blocked when any landing or lead references the row. Admin surfaces a clear Restrict message. Codified in `specs/meta-pixel/spec.md`.
