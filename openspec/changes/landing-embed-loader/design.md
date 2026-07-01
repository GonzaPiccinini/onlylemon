# Design: Landing Embed Loader (Change B)

## Context and Objective

Replace the hand-pasted HTML/JS block on each landing with a single `<script src=".../embed/{landingId}.js" async>` line. The worker serves a self-contained classic JS bundle per landing that inits the Meta Pixel, mounts an **Altcha** proof-of-work captcha, and wires click → `POST /api/leads { landingId }` → open `wa.me/{number}?text=…CODIGO:{code}`. Depends on **Change A** for the data model (`MetaPixel` FK, `whatsappMessages`) and the `landingId`-only leads contract; deployed in the same hard cutover.

This revision swaps Cloudflare Turnstile for **Altcha** (self-hosted PoW, lib `altcha-lib`). Altcha has **no hostname/domain concept**, so the domain-ceiling problem disappears entirely. All embed markup/identifiers are **de-branded** — no "Lemon" anywhere.

## Architecture of `GET /embed/:landingId.js`

```
GET /embed/{landingId}.js
   │  validate landingId; getEmbedConfigByLandingId(landingId)   ← public-only projection
   │     → { id, status, pixelId, whatsappMessages }   (NEVER accessToken)
   ▼  status !== ACTIVE → 404 (no body leak)
renderEmbedBundle(config)
   │  Content-Type: application/javascript; charset=utf-8
   │  ETag: hash(pixelId + messages + RUNTIME_VERSION)
   │  Cache-Control: public, max-age=300, stale-while-revalidate=600   (default; TTL tunable)
   ▼
SHARED_RUNTIME (IIFE)  with a local  const CTA_CONFIG = {JSON.stringify(config)}
```

- **Serving**: new module `worker/src/modules/embed/`. Route `app.get('/embed/:landingId.js', …)` (uuid param; `.js` literal validated defensively). Public GET (script tag, no Origin) — no CORS gating; the gated surface is `POST /api/leads`, covered by existing per-DB CORS for active landing origins.
- **Config read**: `getEmbedConfigByLandingId` uses an explicit Prisma `select` projecting only `{ id, status, whatsappMessages, metaPixel: { select: { pixelId: true } } }`. `accessToken` is structurally unreachable.
- **Caching / invalidation**: short `max-age` + `stale-while-revalidate` + ETag hashing baked config + a `RUNTIME_VERSION` build constant. Admin edits change the ETag; new runtime logic bumps `RUNTIME_VERSION` (global invalidation).

## Altcha captcha (replaces Turnstile)

### Worker — challenge endpoint
New public `GET /altcha/challenge` → `createChallenge({ hmacKey: ALTCHA_HMAC_SECRET, expires: new Date(Date.now() + 600_000) })`; returns the signed challenge JSON (~10 min expiry). Public GET, no CORS special-casing.

### Worker — verify seam
Replace `worker/src/integrations/turnstile.ts` with an Altcha verifier exposing `verifyCaptcha(payload, ip)`. Internally `verifySolution(payload, ALTCHA_HMAC_SECRET, /* checkExpires */ true)` → boolean. Altcha payloads are **one-time**: derive a replay key from the challenge signature and `SET key NX EX <ttl>` in **Redis** (existing `BULLMQ_REDIS_URL` / ioredis); key already present → replay → reject. Invalid / expired / replay → **403** (same status as today).

### `/api/leads` contract change
The `turnstileToken` body field becomes **`altcha`** (the base64 Altcha payload). `leads/http.ts` reads `req.body.altcha`: 400 if missing, `verifyCaptcha` → 403 if invalid. **Coordination**: `leads/http.ts` is *also* edited by **Change A — Fase 2** (landingId re-key). Both edits land in the **same cutover deploy** — they must be merged together to avoid drift.

### Env
Drop `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` from the leads/embed path. Add `ALTCHA_HMAC_SECRET` (single global secret signs *and* verifies). No sitekey is baked into the bundle — Altcha needs none.

## Embed client — Altcha mount (sub-decision)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| **Bundle a minimal PoW solver** inside the embed (self-contained: fetch challenge, SHA-256 counter search, build payload) | +bundle size (Altcha PoW solve is small JS); zero external script, no extra origin, fully de-brandable — aligns with the self-contained + de-branded embed | **Chosen** |
| Load the official `<altcha-widget>` web component from a CDN / the worker | smaller bundle, official UI; adds an external script + harder to de-brand | Rejected |

Runtime: fetch the challenge from `{apiBase}/altcha/challenge`, solve the PoW, build the base64 payload, and send it as `altcha` in the `POST /api/leads` body. The captcha mounts into the neutral container `[data-cta-captcha]` (or an injected child, per mode). `apiBase = new URL(document.currentScript.src).origin` — no hardcoded domain.

## The 3 Modes (branched at runtime by `data-cta-mode`)

One bundle per landing serves all modes; the runtime reads `data-cta-mode` (and optional `data-cta-target`) off its own `<script>` via `document.currentScript`. Mode lives on the tag, not the DB/URL.

| Mode | Owner markup | What the script injects | Captcha mount |
|------|--------------|-------------------------|---------------|
| `solo-logica` | own button + captcha container | wires behavior only | into `[data-cta-captcha]` (owner div) |
| `widget-automontado` | `<div id="cta-root">` | styled button + captcha inside it | into an injected child |
| `boton-flotante` (FAB) | none | fixed floating button + modal | into the injected modal (lazy on open) |

Default CTA selector for `solo-logica` is `[data-cta]`, overridable via `data-cta-target`.

## Contract with `POST /api/leads`

| Field | Source (client-side) |
|-------|----------------------|
| `landingId` | baked `CTA_CONFIG.landingId` |
| `fbc` | `_fbc` cookie; synthesized from `fbclid` URL param if absent (`fb.1.{ts}.{fbclid}`, 90-day cookie) |
| `fbp` | `_fbp` cookie (set by the pixel) |
| `userAgent` | `navigator.userAgent` |
| `altcha` | solved Altcha payload (single-use; verified server-side, never reused) |
| `adCode` (+ `?utm_content=`) | utm_content → sessionStorage → cookie (same precedence as `index.html`); sent in body and query |

On 201 `{ code, number }`: pick a random message from `CTA_CONFIG.messages`, open `wa.me/{number}?text={encode(msg + ' CODIGO:' + code)}`.

## De-branding (permanent convention)

No "Lemon" in embed code / markup / identifiers / comments / snippet examples:

| Old | New |
|-----|-----|
| `data-lemon-mode` | `data-cta-mode` |
| `data-lemon-cta` (trigger) | `data-cta` |
| `data-lemon-target` | `data-cta-target` |
| `data-lemon-turnstile` (captcha container) | `data-cta-captcha` (neutral — no "altcha"/"turnstile") |
| `id="lemon-cta"` (auto-mounted root) | `id="cta-root"` |
| `const LEMON = …` (window global) | local `const CTA_CONFIG` inside the IIFE (not on window; if a window global is unavoidable, use a neutral, collision-safe name) |

**Scope: code/markup/identifiers only.** The public **domain** `app.onlylemon.app` is **out of scope** — a neutral domain is a separate **infra follow-up**. The design **must not hardcode the brand domain**; `apiBase` is derived from `document.currentScript.src`.

## Security

Public-only data in the bundle: `landingId`, `metaPixel.pixelId` (number). No captcha secret in the bundle — Altcha verifies server-side with `ALTCHA_HMAC_SECRET`. `accessToken` is **never** projected/serialized/referenced — enforced by the `select` and asserted by test. Config serialized with `JSON.stringify` (XSS-safe). Classic script: `currentScript` captured synchronously at the top before any await.

**PoW trade-off**: Altcha raises the cost of automation but is **weaker than Turnstile/reCAPTCHA ML** scoring. Mitigations: per-IP **rate-limiting** on `/api/leads` and `/altcha/challenge` (`req.ip`), the existing **`fbc` dedup**, and Redis **one-time replay** rejection. The verify seam is **swappable** — a stronger provider can replace `verifyCaptcha` without touching callers.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `worker/src/modules/embed/embed.routes.ts` | Create | `GET /embed/:landingId.js` |
| `worker/src/modules/embed/embed.controller.ts` | Create | validate id, 404 non-ACTIVE, headers, return bundle |
| `worker/src/modules/embed/bundle.ts` | Create | `renderEmbedBundle` (de-branded runtime + baked `CTA_CONFIG`); `RUNTIME_VERSION` |
| `worker/src/modules/embed/embed.repository.ts` | Create | `getEmbedConfigByLandingId` (public-only `select`) |
| `worker/src/integrations/altcha.ts` | Create | `createAltchaChallenge` + `verifyCaptcha` (verifySolution + Redis replay store) |
| `worker/src/integrations/turnstile.ts` | Delete | replaced by `altcha.ts` |
| `worker/src/modules/captcha/captcha.routes.ts` | Create | `GET /altcha/challenge` |
| `worker/src/integrations/leads/http.ts` | Modify | read `altcha` payload (coordinate with Change A Fase 2 re-key) |
| `worker/src/app/server.ts` | Modify | register embed + altcha routes |
| `worker/src/config/env.ts` | Modify | drop `TURNSTILE_*` (leads path); add `ALTCHA_HMAC_SECRET` |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `renderEmbedBundle` bakes pixelId/messages/landingId; output is valid JS | snapshot + parse |
| Unit | bundle never contains `accessToken` **or any secret** (critical) | render w/ token-bearing pixel; assert excluded |
| Unit | `getEmbedConfigByLandingId` projection has no `accessToken` key | type + runtime assert on `select` |
| Unit | XSS-safe: message with `</script>`/quotes is `JSON.stringify`-escaped | assert serialization |
| Unit | controller: unknown/DISABLED → 404; ACTIVE → 200 `application/javascript`; ETag stable per config, changes on edit | mocked repo |
| Unit | `GET /altcha/challenge` returns a valid signed challenge | `createChallenge` under test secret |
| Unit | `verifyCaptcha`: valid → true; expired → 403; **replay** (2nd use of same payload) → 403 via Redis store | mocked Redis |
| Integration (jsdom) | bundle executes; `data-cta-mode` branch wires click → mocked `fetch` → `window.open` `wa.me/{number}?text=…CODIGO:{code}` | per-mode jsdom run |
| Manual | real Altcha solve; pixel PageView fires | cross-browser smoke |

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `accessToken` leak | public-only projection + assertion test |
| PoW weaker than ML captcha | per-IP rate-limit + `fbc` dedup + swappable verify seam |
| Altcha payload replay | Redis one-time store keyed on challenge signature, TTL = challenge expiry |
| Stale bundle post-edit | short TTL + `stale-while-revalidate` + config/runtime ETag |
| `currentScript` null | classic script; capture at top synchronously |
| `leads/http.ts` double-edit (Change A Fase 2 + Change B) | single coordinated cutover deploy |

**Depends on Change A** (deployed together in the hard cutover): `landingId` routing on `/api/leads`, `MetaPixel` FK (`pixelId` read), `whatsappMessages`, and the landing read shape. Change B now **also owns the worker captcha seam** (challenge endpoint + verify + Redis replay store).

## Pixel Init — Design Addendum (v1.2.0)

### Auto-init approach

The bundle bootstraps the Meta Pixel autonomously on load. No separate `<script>` tag for `fbevents.js` is required on the landing page. Design decisions:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Event call | `fbq('trackSingle', pixelId, 'PageView')` | Scoped to our pixel only; `fbq('track', ...)` fires for ALL pixels on page (wrong for multi-pixel pages) |
| Bootstrap guard | `if (!window.fbq)` | Skip re-injection if another script already bootstrapped fbq — do not clobber it |
| Resilience | Outer `try/catch` wraps entire pixel block | Pixel failure (blocked fbq, 3P cookie restrictions, etc.) must never break the CTA flow |
| fbevents.js injection | Inner `try/catch` around DOM insertion | DOM may not have a `<script>` sibling; queue still works even if injection fails |
| Opt-out | `data-cta-pixel="off"` on the `<script>` tag | Operator escape hatch; consistent with existing `data-cta-*` attribute convention |
| Pixel ID validation | `isValidPixelId`: numeric string ≥ 6 digits | Skips placeholders (`"-"`, `""`) that may appear in misconfigured or staging landings |
| Idempotence | `window.__ctaEmbedInit` guard at IIFE start | Prevents double-init if script tag is accidentally included twice |

### GTM Constraint (NOT supported)

**The embed `<script>` must be a static tag; dynamic injection via GTM or `document.createElement` is NOT supported.**

When a script is injected dynamically (e.g., GTM `Custom HTML` tag uses `document.write` or `appendChild`), `document.currentScript` is `null` per the HTML spec — the browser only sets `currentScript` for parser-inserted classic scripts. This breaks:

- `apiBase` derivation (falls back to `''` — all API calls to relative paths, which may or may not resolve)
- `ctaMode` (falls back to `'solo-logica'`)
- `pixelMode` (falls back to `'auto'`)

The bundle is designed for `<script src=".../embed/{landingId}.js" data-cta-mode="..." async>` placed statically in the HTML. GTM-based deployment is an out-of-scope future enhancement requiring a different distribution strategy.

## Open Questions

- [ ] Confirm the `Cache-Control` TTL (`max-age=300, stale-while-revalidate=600`) vs. ops preference for faster edit propagation.
- [ ] Confirm bundled PoW solver vs. official Altcha web component (recommendation: **bundle**; pending bundle-size measurement).
- [ ] Pick a default Altcha PoW `cost`/difficulty (UX latency vs. anti-automation strength).
