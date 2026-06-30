# Proposal: Landing Embed Loader (Change B)

## Intent

Landing owners today paste a large HTML/JS block (Meta Pixel init + a captcha widget + click→`POST /api/leads`→`wa.me` logic, with a hardcoded pixel number and message array). Updating any logic requires re-pasting on every landing.

Goal: collapse that block to a **single `<script>` tag**. The worker serves a per-landing, self-contained JS bundle. All behavior (pixel init, captcha, lead creation, WhatsApp redirect) is centralized and updatable from the worker without touching the landing page.

This is **Change B**. It depends on **Change A — `pixel-normalization-rekey`**, which provides the data model and routing this change consumes:
- `MetaPixel` table + `Landing.metaPixelId` as FK → `MetaPixel.id` (so the embed reads the public pixel number via `landing.metaPixel.pixelId`).
- `Landing.whatsappMessages: String[]` — the message templates the embed randomizes (replacing the hardcoded array in `index.html`).
- Leads public flow re-keyed to **`landingId`-only** (`POST /api/leads { landingId, … }`), pixel/token/url snapshotted server-side onto the `Lead`. The embed sends `landingId`; it never sees `accessToken`.

## Scope

### In Scope
- Public endpoint `GET /embed/:landingId.js` (Express, worker) serving a self-contained classic JS bundle with baked **public-only** config.
- Three embed modes selected per-landing by the admin, encoded as a `data-cta-mode` attribute on the script tag (no DB field, no URL coupling): `solo-logica`, `widget-automontado`, `boton-flotante`.
- Embed runtime: dynamic Meta Pixel init, **Altcha** proof-of-work captcha mount, click → `POST /api/leads` (with `landingId` + solved `altcha` payload) → open `wa.me/{number}?text=…CODIGO:{code}`.
- Worker captcha seam: public `GET /altcha/challenge` (signed challenge), server-side `verifyCaptcha` (verify + one-time replay store in Redis), `ALTCHA_HMAC_SECRET` env.
- Admin: per-landing one-liner snippet generator + copy (mode-aware). UI detail is Change B frontend; this change defines the snippet contract.

### Out of Scope
- The data model, leads re-key, and admin pixel/messages CRUD — all owned by **Change A**.
- Landing page hosting/templating, analytics beyond existing CAPI.
- The public brand **domain** (a neutral domain is a separate infra follow-up); the embed derives `apiBase` from `document.currentScript.src` and MUST NOT hardcode any domain.
- Hostname/origin allow-listing strategies for the captcha (Altcha has no hostname concept — the problem does not exist).

## Capabilities

### New Capabilities
- `embed-loader`: `GET /embed/:landingId.js` serves a classic JS bundle with baked public config (no secrets) and the three runtime modes branched by `data-cta-mode`.
- `altcha-captcha`: public `GET /altcha/challenge` signed-challenge endpoint + server-side verify with one-time (anti-replay) enforcement.

### Modified Capabilities
- `leads`: `POST /api/leads` requires a new `altcha` payload field (replacing the old captcha-token field); verified server-side. Coordinated with Change A Fase 2 in the same cutover deploy.
- `cors-origins` (no code change): existing dynamic per-DB CORS already covers `POST /api/leads` from active landing origins — confirmed sufficient.

## Approach

`server.ts` registers `GET /embed/:landingId.js` → a handler that reads **public-only** landing config (`landingId`, `metaPixel.pixelId`, `whatsappMessages`, `status`) via a dedicated projection that cannot select `accessToken`, then renders a self-contained classic JS bundle (shared runtime + baked `CTA_CONFIG` literal). Mode is read at runtime from the script tag's `data-cta-mode`; the API base is derived from `document.currentScript.src` origin (no new env). Short-TTL + ETag caching keeps owner snippets stable while reflecting admin edits within minutes. The captcha is **Altcha** (self-hosted PoW): the worker signs challenges and verifies solutions with one global `ALTCHA_HMAC_SECRET`; no sitekey or secret is baked into the bundle, and a Redis one-time store rejects replayed payloads.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `worker/src/app/server.ts` | Modified | Register `GET /embed/:landingId.js` and `GET /altcha/challenge` |
| `worker/src/modules/embed/` (new) | Create | Embed route, controller, bundle generator, public-config repository |
| `worker/src/modules/captcha/` (new) | Create | `GET /altcha/challenge` route |
| `worker/src/integrations/altcha.ts` (new) | Create | `createAltchaChallenge` + `verifyCaptcha` (verify + Redis one-time store) |
| `worker/src/integrations/turnstile.ts` | Delete | Replaced by `altcha.ts` |
| `worker/src/integrations/leads/http.ts` | Modified | Read `altcha` payload (coordinate with Change A Fase 2 re-key) |
| `worker/src/config/env.ts` | Modified | Drop `TURNSTILE_*` (leads path); add `ALTCHA_HMAC_SECRET` |
| `worker/src/modules/admin/` | Modified | Expose embed snippet metadata (mode-aware) |
| `dashboard/src/features/admin/admin-landings-page.tsx` | Modified | Mode selector + one-liner snippet + copy (Change B frontend) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `accessToken` leaks into the served JS | Med→Low | Dedicated public-only projection (cannot select token); unit test asserts the bundle never contains the token or any secret. |
| PoW captcha is weaker than ML-scored captchas | Med | Per-IP rate-limit on `/api/leads` and `/altcha/challenge`; existing `fbc` dedup; Redis one-time replay rejection; verify seam is swappable. |
| Replayed Altcha payload | Med | Redis one-time store keyed on the challenge signature, TTL = challenge expiry; second use → 403. |
| Stale bundle after an admin edit | Med | Short `max-age` + `stale-while-revalidate` + ETag keyed on config + runtime version. |
| XSS via baked config (messages/pixel) | Low | Serialize config with `JSON.stringify`; never string-concat values into JS. |
| `document.currentScript` null (if served as a module) | Low | Bundle is a classic script; capture `currentScript` synchronously at top before any await. |
| `leads/http.ts` double-edit (Change A Fase 2 + Change B) | Med | Single coordinated cutover deploy; merge both edits together. |

## Dependencies
- **Change A (`pixel-normalization-rekey`)** must ship in the same hard cutover: `landingId` routing, `MetaPixel` FK, `whatsappMessages`, and the public-config read shape.
- Redis (existing `BULLMQ_REDIS_URL` / ioredis) for the captcha one-time replay store.

## Success Criteria
- [ ] A landing owner replaces the legacy HTML block with one `<script>` line and the flow works end-to-end in all 3 modes.
- [ ] Editing messages / pixel / mode in admin reflects in the embed with no re-paste (within the cache TTL).
- [ ] `accessToken` is never present in any served bundle (asserted by test).
- [ ] Altcha challenge/verify works end-to-end; a replayed payload is rejected.

## Process Note
Per project standards: implementation PRs link an approved issue, carry exactly one `type:*` label, use `^(feat|fix|chore)/[a-z0-9._-]+$` branch naming, and follow Conventional Commits.
