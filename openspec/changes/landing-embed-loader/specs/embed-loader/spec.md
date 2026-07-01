# Delta for embed-loader

## ADDED Requirements

### Requirement: Embed Endpoint Serves Per-Landing JS Bundle

`GET /embed/:landingId.js` MUST be a public GET that returns a self-contained
classic JS bundle for an ACTIVE landing, with `Content-Type:
application/javascript; charset=utf-8`. A non-ACTIVE or unknown landing MUST NOT
leak a body.

#### Scenario: Active landing returns JS

- GIVEN an ACTIVE landing with id `L`
- WHEN `GET /embed/L.js` is called
- THEN it responds `200` with `Content-Type: application/javascript; charset=utf-8`
- AND the body is an executable IIFE bundle

#### Scenario: Unknown landingId not found

- GIVEN a `landingId` that does not exist
- WHEN `GET /embed/:landingId.js` is called
- THEN it responds `404` with no JS body leaked

#### Scenario: Disabled landing not found

- GIVEN a landing whose status is not ACTIVE (e.g. DISABLED)
- WHEN `GET /embed/:landingId.js` is called with its id
- THEN it responds `404` with no JS body leaked

### Requirement: Baked Public-Only Config Without Secrets

The bundle MUST bake a public-only `CTA_CONFIG` containing `landingId`, the pixel
number (`MetaPixel.pixelId` resolved via the `Landing → MetaPixel` FK), and
`whatsappMessages`. `MetaPixel.accessToken` MUST NEVER appear in the bundle.
Config values MUST be serialized with `JSON.stringify` (XSS-safe).

#### Scenario: Config carries public fields

- GIVEN an ACTIVE landing referencing a pixel with `pixelId = 123`
- WHEN its bundle is rendered
- THEN `CTA_CONFIG` includes `landingId`, `pixelId = 123`, and `whatsappMessages`

#### Scenario: Access token never serialized (critical)

- GIVEN a landing whose pixel row carries a non-empty `accessToken`
- WHEN the bundle is rendered
- THEN the rendered JS string MUST NOT contain the `accessToken` value or key

#### Scenario: Message with markup is escaped

- GIVEN a `whatsappMessages` entry containing `</script>` or quotes
- WHEN the bundle is rendered
- THEN the value is `JSON.stringify`-escaped and does not break out of the script

### Requirement: Three Embed Modes Branched by data-cta-mode

The runtime MUST select one of three modes from the `data-cta-mode` attribute on
its own `<script>` tag (read via `document.currentScript`): `solo-logica`,
`widget-automontado`, `boton-flotante`. Mode lives on the tag, never in the DB or
URL.

#### Scenario: solo-logica wires owner markup

- GIVEN a script tag with `data-cta-mode="solo-logica"`
- AND owner-provided `[data-cta]` trigger and `[data-cta-captcha]` container (default selector `[data-cta]`, overridable via `data-cta-target`)
- WHEN the bundle initializes
- THEN it wires click behavior onto the owner trigger and mounts the captcha into `[data-cta-captcha]` without injecting its own button

#### Scenario: widget-automontado injects into cta-root

- GIVEN a script tag with `data-cta-mode="widget-automontado"`
- AND a host element `id="cta-root"`
- WHEN the bundle initializes
- THEN it injects a styled button and a captcha child inside `#cta-root`

#### Scenario: boton-flotante mounts FAB and modal

- GIVEN a script tag with `data-cta-mode="boton-flotante"`
- AND no owner markup
- WHEN the bundle initializes
- THEN it injects a fixed floating button plus a modal, mounting the captcha into the modal on open

### Requirement: API Base Derived From Script Source

The runtime MUST derive `apiBase` from `document.currentScript.src` origin and
MUST NOT hardcode any domain.

#### Scenario: apiBase from currentScript origin

- GIVEN the script is served from origin `O`
- WHEN the bundle reads `document.currentScript.src`
- THEN `apiBase` equals origin `O`, and challenge/lead requests target `O`

### Requirement: Cache Headers and ETag Invalidation

The response MUST set `Cache-Control: public, max-age=300,
stale-while-revalidate=600` (default TTL; tunable) and an `ETag` equal to a hash
of `pixelId + whatsappMessages + RUNTIME_VERSION`. An admin edit that changes the
baked config MUST change the ETag.

#### Scenario: Cache headers present

- GIVEN an ACTIVE landing
- WHEN its bundle is served
- THEN `Cache-Control: public, max-age=300, stale-while-revalidate=600` is set
- AND an `ETag` derived from `pixelId + messages + RUNTIME_VERSION` is set

#### Scenario: Edit changes the ETag

- GIVEN a bundle served with ETag `E1`
- WHEN an admin edits the landing's messages or pixel
- THEN the next bundle is served with an ETag `E2 != E1`

### Requirement: Click Flow Creates Lead and Opens WhatsApp

On a CTA click the runtime MUST read `fbc`/`fbp` cookies and `utm_content`,
obtain a solved captcha payload, `POST /api/leads` with `landingId`, and on
success open `wa.me/{number}` with a randomized message carrying the returned
code.

#### Scenario: Successful click opens wa.me with code

- GIVEN an initialized bundle for landing `L`
- WHEN the CTA is clicked and the captcha is solved
- THEN it POSTs to `{apiBase}/api/leads` with `landingId = L`, `altcha`, `fbc`, `fbp`, `userAgent`, and `adCode` (from `utm_content`)
- AND on `201 { code, number }` it opens `wa.me/{number}?text={encoded message + ' CODIGO:' + code}`

### Requirement: Autonomous Meta Pixel Initialization (v1.2.0)

The bundle MUST auto-initialize the Meta Pixel for the landing's `pixelId` on load, unless the operator opts out via `data-cta-pixel="off"`. All pixel operations are scoped using `trackSingle` (not `track`) to avoid interfering with other pixels on the page. The entire pixel-init block MUST be guarded by `try/catch` so a pixel failure never blocks the CTA flow.

#### Scenario 1 (auto-init): Default pixel initialization

- GIVEN a `<script>` tag without `data-cta-pixel` attribute (or `data-cta-pixel="auto"`)
- AND `CTA_CONFIG.pixelId` is a valid numeric string of 6 or more digits
- WHEN the bundle initializes
- THEN it bootstraps `window.fbq` if not already present (defines queue, loads `fbevents.js` async)
- AND calls `fbq('init', pixelId)` and `fbq('trackSingle', pixelId, 'PageView')`
- AND does NOT call `fbq('track', ...)` (non-isolated form)

#### Scenario 2 (trackSingle isolation): No interference with co-resident pixels

- GIVEN other Meta Pixels may already be active on the host page
- WHEN the bundle fires the PageView event
- THEN it uses `fbq('trackSingle', pixelId, 'PageView')` — scoped to our pixel only
- AND does NOT use `fbq('track', 'PageView')` which would fire for ALL pixels on the page

#### Scenario 3 (opt-out): Pixel suppressed by operator

- GIVEN a `<script>` tag with `data-cta-pixel="off"`
- WHEN the bundle initializes
- THEN pixel initialization is entirely skipped
- AND `fbq('init', ...)` and `fbq('trackSingle', ...)` are NOT called
- AND the CTA flow (lead submission) is unaffected

#### Scenario 4 (idempotence): Script loaded twice produces one init

- GIVEN the embed script is included twice on the same page (misconfiguration)
- WHEN both script tags execute
- THEN `window.__ctaEmbedInit` guard fires on the second execution
- AND the pixel is initialized exactly once
- AND the CTA click handlers are registered exactly once

#### Scenario 5 (resilience): Pixel failure never blocks CTA

- GIVEN `window.fbq` throws an exception when called
- WHEN the bundle initializes
- THEN the exception is caught silently
- AND the CTA is still wired and functional (lead submission proceeds normally)
- AND `_fbc` synthesis from `fbclid` is preserved as a fallback

#### Scenario 6 (invalid pixelId): Skip pixel for placeholder or empty values

- GIVEN `CTA_CONFIG.pixelId` is an empty string, `"-"`, or any non-numeric value
- WHEN the bundle initializes
- THEN `isValidPixelId` returns false
- AND `fbq` is NOT called
- AND the CTA flow is unaffected

#### Scenario 7 (pre-existing fbq): No re-bootstrap when fbq already loaded

- GIVEN `window.fbq` is already defined (another pixel or script bootstrapped it first)
- WHEN the bundle initializes
- THEN the bootstrap block (`window.fbq = ...`) is skipped (no re-injection of `fbevents.js`)
- AND `fbq('init', pixelId)` and `fbq('trackSingle', pixelId, 'PageView')` are still called

#### Scenario 8 (GTM constraint — not supported): Dynamic injection breaks currentScript

- GIVEN the embed script is injected dynamically (e.g., via GTM `Custom HTML` tag)
- WHEN the bundle executes
- THEN `document.currentScript` is `null` (browser spec — null in dynamically injected scripts)
- AND `apiBase`, `ctaMode`, `pixelMode` all fall back to defaults
- NOTE: dynamic injection is NOT a supported deployment path; the bundle must be a static `<script src="...">` tag
