# Tasks: Landing Embed Loader (Change B)

> **Coordination with Change A:** `worker/src/integrations/leads/http.ts` is
> modified by both Change A (Fase 2 — `landingId` re-key) and Change B (captcha
> swap). Both edits MUST land in the **same maintenance-window cutover deploy**.
> Tasks 1.7–1.8 are blocked until Change A Fase 2 is merged alongside them.
>
> **Open questions (tunable — do not re-decide here):** Cache TTL
> (`max-age=300, stale-while-revalidate=600`); Altcha PoW `cost`/difficulty;
> post-implementation bundle-size measurement.

---

## Phase 0 — Process (issue-first)

- [x] 0.1 Create GitHub issue for Change B ("Landing embed loader + Altcha captcha seam"); add label `type:feat`; note the Change A cutover dependency. → Issue #81
- [ ] 0.2 Create branch `feat/landing-embed-loader` from `main`.

---

## Phase 1 — Altcha Captcha Seam (worker)

- [x] 1.1 **[RED]** Write failing tests for `worker/src/integrations/altcha.ts` — `verifyCaptcha`: valid payload → ok; invalid signature → reject; expired challenge → reject; replay (2nd use same payload) → reject (mocked Redis `SET NX`).
- [x] 1.2 **[GREEN]** Create `worker/src/integrations/altcha.ts`: `createAltchaChallenge()` (signs with `ALTCHA_HMAC_SECRET`, 10 min expiry via `altcha-lib`) + `verifyCaptcha(payload, ip)` (`verifySolution` + Redis one-time replay store keyed on challenge signature, `SET key NX EX <ttl>` via existing `BULLMQ_REDIS_URL` / ioredis).
- [x] 1.3 **[RED]** Write failing test for `GET /altcha/challenge`: responds 200 with a signed challenge JSON; response body does NOT contain `ALTCHA_HMAC_SECRET`.
- [x] 1.4 **[GREEN]** Create `worker/src/modules/captcha/captcha.routes.ts`: public `GET /altcha/challenge` handler calling `createAltchaChallenge()`.
- [x] 1.5 Modify `worker/src/config/env.ts`: add `ALTCHA_HMAC_SECRET: z.string().min(1)`; remove `TURNSTILE_SECRET_KEY` from schema.
- [x] 1.6 Register captcha route in `worker/src/app/server.ts`: `app.use('/altcha', captchaRouter)` (public GET, no CORS gating needed).
- [x] 1.7 **[RED]** Write failing tests for `worker/src/integrations/leads/http.ts` after swap: missing `altcha` field → 400; failed `verifyCaptcha` (invalid/expired/replay) → 403; valid `altcha` → proceeds to lead creation 201. *(Depends on Change A Fase 2 landingId re-key — must be co-authored and deployed together.)*
- [x] 1.8 **[GREEN]** Modify `worker/src/integrations/leads/http.ts`: replace `turnstileToken` read + `verifyTurnstileToken` call with `altcha` field read + `verifyCaptcha` call; merge Change A Fase 2 edits into the same file change. **[CUTOVER COORDINATION — deploy with Change A]**
- [x] 1.9 Delete `worker/src/integrations/turnstile.ts`.

---

## Phase 2 — Embed Endpoint + Bundle (worker)

- [x] 2.1 **[RED]** Write failing tests for `worker/src/modules/embed/embed.repository.ts`: ACTIVE landing → returns `{ id, status, pixelId, whatsappMessages }`; DISABLED or unknown → null; Prisma `select` object has no `accessToken` key (structural assertion).
- [x] 2.2 **[GREEN]** Create `worker/src/modules/embed/embed.repository.ts`: `getEmbedConfigByLandingId(landingId)` with explicit Prisma `select { id, status, whatsappMessages, metaPixel: { select: { pixelId: true } } }` — `accessToken` structurally unreachable.
- [x] 2.3 **[RED]** Write failing tests for `worker/src/modules/embed/bundle.ts`: output contains `CTA_CONFIG` with `landingId`, `pixelId`, `whatsappMessages`; output NEVER contains `accessToken` value or key (critical — token-bearing fixture); `</script>` in messages is `JSON.stringify`-escaped; ETag changes when config changes; ETag changes when `RUNTIME_VERSION` bumps.
- [x] 2.4 **[GREEN]** Create `worker/src/modules/embed/bundle.ts`: `renderEmbedBundle(config)` — classic IIFE with local `const CTA_CONFIG` (no window global); bundled minimal PoW solver (self-contained: fetch challenge, SHA-256 counter, build payload); `apiBase = new URL(document.currentScript.src).origin` (captured synchronously before any await); 3-mode runtime branches (`data-cta-mode`: `solo-logica` wires `[data-cta]`/`[data-cta-captcha]`, `widget-automontado` injects into `#cta-root`, `boton-flotante` injects FAB + modal); ETag = `hash(pixelId + messages + RUNTIME_VERSION)`; `RUNTIME_VERSION` constant.
- [x] 2.5 **[RED]** Write failing tests for `worker/src/modules/embed/embed.controller.ts` (mocked repository): ACTIVE → 200 `application/javascript; charset=utf-8` + `Cache-Control: public, max-age=300, stale-while-revalidate=600` + ETag; DISABLED → 404 with no JS body; unknown landingId → 404 with no JS body; ETag stable across identical config calls; ETag differs after config edit.
- [x] 2.6 **[GREEN]** Create `worker/src/modules/embed/embed.controller.ts`: validate `landingId` param; call repository; non-ACTIVE/unknown → 404 (empty body); set `Content-Type`, `Cache-Control`, `ETag`; return `renderEmbedBundle` output.
- [x] 2.7 Create `worker/src/modules/embed/embed.routes.ts`: `GET /embed/:landingId.js`.
- [x] 2.8 Register embed route in `worker/src/app/server.ts`: `app.use('/embed', embedRouter)` (public, before CORS-gated routes).
- [x] 2.9 **[RED → GREEN]** Write jsdom integration tests for the 3 modes — bundle executes; `data-cta-mode` branch initialized; CTA click → mocked `fetch /api/leads` → `window.open` `wa.me/{number}?text=…CODIGO:{code}`; one test per mode (`solo-logica`, `widget-automontado`, `boton-flotante`).

---

## Phase 3 — Admin Snippet UI (dashboard)

- [x] 3.1 **[RED]** Write tests/lint checks for snippet component in `dashboard/src/features/admin/admin-landings-page.tsx`: mode selector renders 3 options; copy button calls `navigator.clipboard.writeText`; one-liner matches `<script src=".../{landingId}.js" data-cta-mode="{mode}" async></script>` with no "Lemon" in any attribute. *(Dashboard has no test runner — standard mode: TypeScript build + lint verified)*
- [x] 3.2 **[GREEN]** Modify `dashboard/src/features/admin/admin-landings-page.tsx`: add per-landing mode selector (`solo-logica` / `widget-automontado` / `boton-flotante`); one-liner snippet display with the selected mode; copy-to-clipboard button; enforce neutral naming (`data-cta-*`, `id="cta-root"`, no "Lemon" references anywhere).

---

## Phase 4 — Cutover Rollout

- [ ] 4.1 Provision `ALTCHA_HMAC_SECRET` in production environment before deploy; confirm `TURNSTILE_SECRET_KEY` can be decommissioned post-cutover.
- [ ] 4.2 Deploy in **maintenance window** together with Change A Fase 2: worker (Altcha seam + embed endpoint + admin snippet) + `leads/http.ts` with both re-key and captcha swap merged.
- [ ] 4.3 Post-cutover smoke test: real Altcha challenge/solve end-to-end; Meta Pixel `PageView` fires; `wa.me` redirect opens with `CODIGO:{code}`; each ACTIVE landing's embed snippet is accessible.
- [ ] 4.4 Open PR(s) with label `type:feat`; link the issue created in task 0.1; branch `feat/landing-embed-loader`; Conventional Commits.
