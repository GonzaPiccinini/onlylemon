# Tasks: Pixel Normalization & Leads Re-key (Change A)

> **Strict TDD**: `[T]` = write the failing test first (RED), then implement (GREEN).  
> **[NEEDS-B]** = depends on Change B (embed endpoint) for coordinated deploy — do NOT block development, only block the deploy step.  
> Phases follow the expand → cutover → contract deploy order.

---

## Phase 0: Process

- [x] 0.1 Create GitHub issue (label `type:feat`); confirm `status:approved` before writing any code
- [x] 0.2 Create branch `feat/pixel-normalization-rekey` from `main`

---

## Phase 1: Expand — Schema + Backfill

- [x] 1.1 `[T]` Write `worker/src/__tests__/migration-pixel-normalization.test.ts`: assert MetaPixel dedup (1 row per distinct `(pixelId, accessToken)`); `Landing.metaPixelRef` set; `Lead.metaPixelRef`, `landingId`, `eventSourceUrl` set for ALL leads including `NOT_CONTACTED`; idempotent re-run leaves values unchanged
- [x] 1.2 Add `MetaPixel` model to `worker/prisma/schema.prisma`; add nullable transitional columns: `Landing.metaPixelRef String?` (FK → MetaPixel.id), `Landing.whatsappMessages String[] @default([])`, `Lead.metaPixelRef String?` (FK → MetaPixel.id), `Lead.eventSourceUrl String?`, `Lead.landingId String?`; run `prisma migrate dev` to generate expand migration SQL
- [x] 1.3 Write `worker/scripts/backfill-pixel-normalization.ts`: upsert one `MetaPixel` per distinct `(pixelId, accessToken)` from `Landing`; set `Landing.metaPixelRef`; set each `Lead.metaPixelRef` + `landingId` + `eventSourceUrl` from the 1:1 `Landing` via old `metaPixelId` number (unique pre-cutover); skip rows already populated (idempotent)
- [x] 1.4 Run migration + backfill on test DB; verify 1.1 suite passes (GREEN)

---

## Phase 2: Cutover — Leads Re-key

> **[NEEDS-B]** coordinated deploy: Change B embed must be live and every ACTIVE landing's snippet deployed before flipping the worker.

- [ ] 2.1 `[T]` Add/update `worker/src/__tests__/leads.http.test.ts`: missing `landingId` → 400 `{ message: 'Invalid body data' }`; unknown `landingId` → 404 `{ message: 'Landing not found' }`; DISABLED landing → 404 `{ message: 'Landing not found or disabled' }` (never 403); duplicate `fbc` → 409; success → 201 `{ code, number }`; client-supplied `metaPixelId` field is ignored
- [ ] 2.2 Update `worker/src/integrations/leads/http.ts`: `CreateLeadPayloadSchema` requires `landingId`; remove `metaPixelId` from schema; 400 on zod fail
- [ ] 2.3 `[T]` Write/update `worker/src/__tests__/leadsRepository.test.ts`: `getActiveLandingCashierCandidatesByLandingId`, `getAllLinkedCashierCandidatesByLandingId`, `getLandingFallbackPhonesByLandingId`, `getContactedLeadCountByCashierForLanding` keyed by `landingId`; assert deficit count for L1 and L2 sharing one pixel is NOT conflated (L1 contacts don't count for L2)
- [ ] 2.4 Update `worker/src/persistence/repositories/leadsRepository.ts`: rename all 4 `…ByMetaPixelId` functions to `…ByLandingId` (update callers); `saveLead` writes `landingId`, `metaPixelId` (FK = landing.metaPixelRef), `eventSourceUrl` (= landing.url) and returns `include: { metaPixel: true }`; `getLeadByCode` adds `include: { metaPixel: true }`
- [ ] 2.5 `[T]` Write/update `worker/src/__tests__/leads.service.test.ts`:
  - Snapshot captured at create: `Lead.metaPixelId` = P1.id, `Lead.eventSourceUrl` = U1
  - Snapshot immunity: reassign landing to P2 → `Contact` dispatch still uses P1 + U1
  - Token rotation: rotate `accessToken` on pinned row M → `Contact` reads M's current token (pin holds, value drifts)
  - `accessToken` absent from any lead DTO or response
- [ ] 2.6 Update `worker/src/integrations/leads/service.ts`: `createLead(landingId)` → `getLandingById(landingId, { include: { metaPixel: true } })`; pass `metaPixelId: landing.metaPixelId (FK)` + `eventSourceUrl: landing.url` snapshots to `saveLead`; `dispatchLeadCreatedEvent` and `dispatchLeadContactedEvent` read `lead.metaPixel.{pixelId, accessToken}` + `lead.eventSourceUrl`; remove `getLandingByMetaPixelId` from dispatch path; update `mapLeadCodeToPhone` to propagate snapshot fields
- [ ] 2.7 Verify `worker/src/integrations/leads/conversion.ts` unchanged — it already accepts `{ pixelId, accessToken, eventSourceUrl }` per call

---

## Phase 3: Admin — Backend

- [x] 3.1 `[T]` Write `worker/src/__tests__/admin-meta-pixel.service.test.ts`: create persists + token masked on list/get; duplicate `pixelId` → unique violation; `pixelId` edit blocked when leads exist; `pixelId` edit allowed when only landings reference row; `accessToken`/`label` editable regardless of references; delete blocked by landing ref + by lead ref; delete succeeds when unreferenced
- [x] 3.2 Add MetaPixel CRUD to `worker/src/modules/admin/admin.repository.ts`: `createMetaPixel`, `listMetaPixels`, `getMetaPixelById`, `updateMetaPixel`, `deleteMetaPixel`; DTO output omits `accessToken`
- [x] 3.3 Add guard logic to MetaPixel service in `worker/src/modules/admin/admin.service.ts`: check lead reference count before allowing `pixelId` edit (blocked if ≥1 lead); catch Prisma `P2003`/`P2014` Restrict errors on delete → return friendly 409 with reference context
- [x] 3.4 Add MetaPixel routes + Zod schemas + controller in `worker/src/modules/admin/` (POST/GET/PUT/DELETE `/admin/meta-pixels/:id?`)
- [x] 3.5 `[T]` Write `worker/src/__tests__/admin-landing.service.test.ts`: pixel assigned via FK; 6 non-empty messages → 400; message >250 chars → 400; empty strings discarded before count; 4 non-empty + 3 empty → accepted; messages trimmed; change pixel = reassign FK (P1 row untouched)
- [x] 3.6 Add `whatsappMessages` validation to landing PUT Zod schema: `z.string().trim()` each item; filter out empty strings; `max(5)` on resulting array; each item `max(250)` chars; return 400 on violation
- [x] 3.7 Add landing pixel selector: extend landing PUT to accept `metaPixelId` (FK); extend `getLandingById` in `admin.repository.ts` to include nested `metaPixel` (id, pixelId, label) for the selector dropdown

---

## Phase 4: Admin — Frontend

- [x] 4.1 Update `dashboard/src/types/domain.ts`: add `MetaPixel { id: string; pixelId: string; label?: string }` (no `accessToken`); update `Landing`: add `metaPixelId: string`, `metaPixel?: MetaPixel`, `whatsappMessages: string[]`; remove scalar `metaAccessToken` and scalar `metaPixelId` number fields
- [x] 4.2 Update `dashboard/src/features/admin/admin-landings-page.tsx`: replace scalar `metaPixelId` number input + `metaAccessToken` input with a `<Select>` populated from `/admin/meta-pixels` list (option label = `label ?? pixelId`); add messages list editor with add/remove/reorder, client-side validation (≤5, ≤250 chars, non-empty after trim); show frozen `pixelId` field with explanation when the pixel has leads; show clear block message with reference count when delete is rejected by the server

---

## Phase 5: Tighten + Contract

> Run only after cutover verify window and a DB backup.

- [ ] 5.1 `[T]` Extend `migration-pixel-normalization.test.ts`: tighten — FKs `NOT NULL` + `onDelete: Restrict` enforced; contract — old scalar columns absent, `metaPixelRef` renamed to `metaPixelId` on `Landing` and `Lead`
- [ ] 5.2 Generate tighten Prisma migration: set `Landing.metaPixelRef`, `Lead.metaPixelRef`, `Lead.eventSourceUrl`, `Lead.landingId` to `NOT NULL`; set `onDelete: Restrict` on both MetaPixel FKs
- [ ] 5.3 Generate contract Prisma migration: drop `Landing.metaAccessToken`; drop old scalar `Landing.metaPixelId` (number + `@unique`); drop old pixel-number column on `Lead`; rename `metaPixelRef → metaPixelId` on both `Landing` and `Lead`; update `schema.prisma` to final contracted state (matches design.md model)

---

## Phase 6: Rollout

- [ ] 6.1 Pre-cutover checklist: **[NEEDS-B]** verify Change B embed endpoint is deployed; verify every ACTIVE landing's embed snippet is deployed and reachable via URL; confirm backfill ran and all `metaPixelRef`/`landingId`/`eventSourceUrl` columns are non-null for all leads
- [ ] 6.2 Cutover window (short, one pass): deploy Change B + swap ALL landing snippets + deploy Change A worker flip; verify `POST /api/leads` with `landingId` succeeds end-to-end for each active landing
- [ ] 6.3 Open PR(s) linking approved issue; carry exactly one `type:feat` label; branch name matches `^feat\/[a-z0-9._-]+$`; commits follow Conventional Commits `feat(scope): description`; PR body includes pre-cutover checklist + test plan referencing all TDD scenarios above

---

### Task Summary

| Phase | Tasks | Test-first tasks |
|-------|-------|-----------------|
| Phase 0: Process | 2 | 0 |
| Phase 1: Expand | 4 | 1 (1.1) |
| Phase 2: Cutover | 7 | 3 (2.1, 2.3, 2.5) |
| Phase 3: Admin Backend | 7 | 2 (3.1, 3.5) |
| Phase 4: Admin Frontend | 2 | 0 |
| Phase 5: Contract | 3 | 1 (5.1) |
| Phase 6: Rollout | 3 | 0 |
| **Total** | **28** | **7** |

### Dependency notes

- Phase 1 ships with current code — no routing change yet.
- Phase 2 code can be built and tested before Phase 1's backfill is complete, but its **deploy** requires Phase 1 expand migration + backfill to have run first.
- Phase 3 + 4 can be developed in parallel with Phase 2.
- Phase 5 is gated on: Phase 2 cutover successfully deployed + a verify window.
- Phase 6.1 coordinated deploy is gated on Change B being ready **[NEEDS-B]**.
