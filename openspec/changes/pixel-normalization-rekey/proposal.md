# Proposal: Pixel Normalization & Leads Re-key (Change A)

> Derived from and scoped narrower than the master `landing-embed-loader/proposal.md`.
> This change covers ONLY the data-model normalization and the leads re-key.
> The embed endpoint, the 3 embed modes, and Turnstile hostname strategy are **Change B** and out of scope here.

## Intent

Today `Landing` carries the Meta pixel inline as two scalars: `metaPixelId @unique` (the pixel **number**) and `metaAccessToken` (a server secret). One pixel cannot be reused across landings, the token sits on the landing row, and the live leads path is keyed by the pixel number. We normalize the pixel into its own table, re-key the revenue-critical leads flow to **`landingId` only**, and make per-landing WhatsApp messages editable. Because all legacy landings will be migrated to the embed, there is **no permanent compat code**: routing flips in a single **hard cutover** (no dual-accept shim), while schema DDL stays expand/contract for DB safety.

## Scope

### In Scope
- New table `MetaPixel { id, pixelId, accessToken, label, createdAt, updatedAt }`. `pixelId` unique; `accessToken` server-side only.
- `Landing` gains FK `metaPixelId → MetaPixel.id` (selector in admin); several landings may **share one pixel from day 1** (no confirm-gate, no "migrate before sharing" restriction). Old scalars `metaPixelId` (number) + `metaAccessToken` removed at contract.
- `Landing.whatsappMessages: String[]` — per-landing, editable in admin (today hardcoded in the landing HTML).
- Re-key the leads flow to **`landingId` only**. `metaPixelId` no longer comes from the client for routing; the pixel (number + token, incl. CAPI) is always resolved server-side via the `Landing → MetaPixel` FK.
- Add `Lead.landingId` (FK, **required** after tighten) for precise per-landing routing/attribution; keep `Lead.metaPixelId` as a historical pixel-number snapshot (no backfill to FK).
- Admin: `MetaPixel` CRUD (token never returned raw), pixel selector on the Landing form, WhatsApp-messages editor.
- Schema expand/contract migration (DB-safe) + hard routing cutover.

### Out of Scope (Change B)
- `GET /embed/:landingId.js` endpoint and the 3 embed modes.
- Turnstile hostname strategy / `TURNSTILE_SITE_KEY`.

## Capabilities

### New
- `meta-pixel-table`: MetaPixel as first-class entity; CRUD in admin; Landing FK; token stays server-side.
- `landing-messages`: per-landing `whatsappMessages` array stored in DB; editable in admin.
- `leads-routing-by-landing`: leads flow keyed by `landingId` only; `metaPixelId` no longer routes (resolved server-side via FK). Hard cutover, no shim.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `worker/prisma/schema.prisma` | Modified | Add `MetaPixel`; FK + `whatsappMessages` on `Landing`; `landingId` on `Lead`; drop old scalars at contract |
| `worker/src/integrations/leads/{http,service}.ts` | Modified | Require `landingId` (400 if missing); re-key selection + deficit count to `landingId`; drop `metaPixelId` routing |
| `worker/src/integrations/leads/conversion.ts` + `service.ts` dispatch | Modified | Resolve `pixelId` + `accessToken` from `landing.metaPixel` (one row) |
| `worker/src/persistence/repositories/leadsRepository.ts` | Modified | `…ByMetaPixelId` → `…ByLandingId`; `saveLead` writes `landingId` |
| `worker/src/modules/admin/` | Modified | MetaPixel CRUD; Landing form (FK selector + messages); token never serialized |
| `dashboard/src/features/admin/admin-landings-page.tsx`, `dashboard/src/types/domain.ts` | Modified | Pixel selector, messages editor, `MetaPixel` type, `Landing` type update |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A landing not swapped during the cutover window → its leads silently cut (worker now requires `landingId`, old snippet sends `metaPixelId`) | High | Pre-flip swap checklist: verify EVERY `ACTIVE` landing has its embed deployed and reachable before flipping the worker; keep the window short, verify in one pass. |
| Deficit/load-balance count conflates landings that share a pixel | High | `Lead.landingId` required; `getContactedLeadCountByCashierForLanding` keys by `landingId`. |
| `metaAccessToken` leaks to public | Med | Token lives only on `MetaPixel` server-side; never in any landing/embed DTO; masked in admin DTO. |

## Rollback Plan

Expand migrations are additive — rollback = redeploy prior code; new nullable columns are harmless. The hard cutover is the real point of no easy return for routing: if leads break, roll the worker back to the pixel-routing build (still present until tighten/contract) and revert landing snippets. Contract (drop old scalars + rename FK) is irreversible-without-restore — run only after a verify window + DB backup. Until contract, the old `metaPixelId`/`metaAccessToken` columns still exist, so reverting to prior code is clean.

## Dependencies

- None upstream. With the hard cutover, Change B (`landing-embed-loader`) must **exist and all landings must be swapped** for the routing flip — so A and B are specified separately but **deployed together** in the cutover window.

## Success Criteria

- [ ] After cutover, `POST /api/leads` requires `landingId`: missing → 400, unknown/DISABLED → 404.
- [ ] The worker routes solely by `landingId`; `metaPixelId` is never read from the client.
- [ ] One `MetaPixel` can back several landings from day 1 (no confirm-gate); admin can CRUD pixels and pick one per landing.
- [ ] `whatsappMessages` is editable per landing in admin.
- [ ] `metaAccessToken` is never present in any publicly served payload or landing DTO; pixel + token resolved server-side via FK (incl. CAPI).
- [ ] Unit tests cover the 400/404 contract, the re-keyed deficit count (shared pixels not conflated), and the expand backfill.

## Process Note

Implementation PRs link an approved issue, carry one `type:*` label, use `^(feat|fix|chore)/[a-z0-9._-]+$` branch naming, and follow Conventional Commits.
