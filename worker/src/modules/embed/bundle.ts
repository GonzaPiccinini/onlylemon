import { createHash } from 'node:crypto';

/**
 * Embed bundle runtime version.
 * Bump this constant to invalidate all ETags globally (forces CDN re-fetch
 * after a runtime logic change, independent of per-landing config changes).
 */
export const RUNTIME_VERSION = '1.3.0';

export type EmbedConfig = {
  landingId: string;
  pixelId: string;
  messages: string[];
};

/**
 * XSS-safe JSON serialization.
 *
 * JSON.stringify leaves `<`, `>`, and `&` as-is, which is valid JSON but can
 * break out of a `<script>` block or trigger HTML entity substitution.
 * Replace them with their Unicode escape equivalents so the bundle is safe
 * when embedded in an HTML page.
 */
export function safeJsonSerialize(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * Computes the HTTP ETag for an embed bundle.
 *
 * ETag = SHA-256( pixelId | messages | RUNTIME_VERSION )
 * Quoted per HTTP/1.1 spec (RFC 7232 §2.3).
 *
 * A change in landing config (pixelId or messages) OR a RUNTIME_VERSION
 * bump will produce a new ETag, invalidating CDN / browser caches.
 */
export function computeEmbedETag(config: EmbedConfig): string {
  const content = `${config.pixelId}|${config.messages.join(',')}|${RUNTIME_VERSION}`;
  const hash = createHash('sha256').update(content).digest('hex');
  return `"${hash}"`;
}

/**
 * Solves an Altcha PoW challenge using SHA-256 via Web Crypto API.
 *
 * Protocol (altcha-lib v1):
 *   challenge = SHA-256(salt + number)          (no separator between salt and number)
 *   The salt already has URL params appended (e.g. "?expires=...&")
 *
 * This function is exported for unit testing (round-trip) and its body is
 * also embedded verbatim (as vanilla JS) in the IIFE bundle string below.
 *
 * Works in Node 18+ (globalThis.crypto.subtle) and in browsers.
 */
export async function solveAltchaChallenge(ch: {
  algorithm: string;
  challenge: string;
  salt: string;
  signature: string;
  maxnumber?: number;
}): Promise<string> {
  const { algorithm, challenge, salt, signature, maxnumber = 1_000_000 } = ch;
  const encoder = new TextEncoder();
  for (let i = 0; i <= maxnumber; i++) {
    const buf = await globalThis.crypto.subtle.digest(
      algorithm.toUpperCase(),
      encoder.encode(salt + i),
    );
    const hex = [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (hex === challenge) {
      return btoa(JSON.stringify({ algorithm, challenge, number: i, salt, signature }));
    }
  }
  throw new Error(`Altcha challenge could not be solved within ${maxnumber} iterations`);
}

/**
 * Renders the self-contained JS embed bundle for a landing page.
 *
 * Output is a classic-script IIFE (immediately invoked function expression)
 * that:
 *   - Bakes the public config as a local `const CTA_CONFIG` (never on window)
 *   - Derives `apiBase` from `document.currentScript.src` (no hardcoded domain)
 *   - Includes a self-contained Altcha PoW solver (fetch challenge → SHA-256
 *     counter search → build base64 payload)
 *   - Branches on `data-cta-mode` for 3 runtime modes:
 *       solo-logica       — wires owner-provided button + captcha container
 *       widget-automontado — injects button + captcha into #cta-root
 *       boton-flotante    — injects fixed FAB + modal (captcha lazy-init on open)
 *
 * SECURITY: config is serialized with safeJsonSerialize (XSS-safe).
 *           accessToken is never in EmbedConfig and never reaches this function.
 */
export function renderEmbedBundle(config: EmbedConfig): string {
  const configJson = safeJsonSerialize({
    landingId: config.landingId,
    pixelId: config.pixelId,
    messages: config.messages,
  });

  return `/* CTA embed v${RUNTIME_VERSION} — generated for landing ${config.landingId} */
(function () {
  'use strict';

  // ── Idempotence guard ─────────────────────────────────────────────────────
  // Prevents double-init if this script is inadvertently included twice on the page.
  if (window.__ctaEmbedInit) return;
  window.__ctaEmbedInit = true;

  // Capture currentScript synchronously at the top.
  // Must be classic script (not module) — currentScript is null in modules and async callbacks.
  var _cs = document.currentScript;
  var apiBase = _cs ? new URL(_cs.src).origin : '';
  var ctaMode = (_cs && _cs.getAttribute('data-cta-mode')) || 'solo-logica';
  var ctaTarget = (_cs && _cs.getAttribute('data-cta-target')) || '[data-cta]';

  // Public config — baked at bundle generation time. No server secrets included.
  var CTA_CONFIG = ${configJson};

  // ── Meta Pixel init ────────────────────────────────────────────────────────
  // Auto-initializes the Meta Pixel for this landing unless data-cta-pixel="off".
  // Uses trackSingle (not track) so the event is scoped to our pixel only and does
  // not interfere with other pixels already on the page (scenario 2/7).
  // Fully wrapped in try/catch — a pixel failure must NEVER block the CTA flow.

  var pixelMode = (_cs && _cs.getAttribute('data-cta-pixel')) || 'auto';

  function isValidPixelId(p) {
    return typeof p === 'string' && /^\\d{6,}$/.test(p);
  }

  if (pixelMode !== 'off' && isValidPixelId(CTA_CONFIG.pixelId)) {
    try {
      if (!window.fbq) {
        // Bootstrap fbq queue synchronously — calls are queued until fbevents.js processes them.
        // fbevents.js is loaded async in a separate inner try/catch so queue works even on failure.
        var _fbq = function() { _fbq.queue.push(Array.prototype.slice.call(arguments)); };
        _fbq.queue = [];
        _fbq.loaded = true;
        _fbq.version = '2.0';
        window.fbq = _fbq;
        window._fbq = _fbq;
        try {
          var _fbScript = document.createElement('script');
          _fbScript.async = true;
          _fbScript.src = 'https://connect.facebook.net/en_US/fbevents.js';
          var _firstScript = document.getElementsByTagName('script')[0];
          if (_firstScript && _firstScript.parentNode) {
            _firstScript.parentNode.insertBefore(_fbScript, _firstScript);
          }
        } catch (_e) { /* fbevents.js injection non-blocking — queue still works */ }
      }
      window.fbq('init', CTA_CONFIG.pixelId);
      window.fbq('trackSingle', CTA_CONFIG.pixelId, 'PageView');
    } catch (_e) {
      // Pixel init failed — CTA flow continues unaffected.
    }
  }

  // ── State ─────────────────────────────────────────────────────────────────
  var _submitting = false;       // double-click guard
  var _solvedPayload = null;     // pre-solved captcha payload string
  var _solvedAt = 0;             // timestamp of pre-solve (ms)
  var CAPTCHA_FRESH_MS = 8 * 60 * 1000; // 8 min (server challenge expires in 10 min)

  // ── Utilities ──────────────────────────────────────────────────────────────

  function getCookie(name) {
    var pairs = document.cookie.split('; ');
    for (var i = 0; i < pairs.length; i++) {
      var kv = pairs[i];
      if (kv.startsWith(name + '=')) {
        return kv.slice(name.length + 1);
      }
    }
    return null;
  }

  function resolveAdCode() {
    var params = new URLSearchParams(window.location.search);
    var fromUrl = (params.get('utm_content') || '').trim();
    if (fromUrl) return fromUrl;
    try {
      var fromSession = sessionStorage.getItem('utm_content');
      if (fromSession) return fromSession;
    } catch (e) {}
    var fromCookie = getCookie('utm_content');
    if (fromCookie) {
      try { return decodeURIComponent(fromCookie); } catch (e) { return fromCookie; }
    }
    return '';
  }

  function persistAdCode(value) {
    if (!value) return;
    try { sessionStorage.setItem('utm_content', value); } catch (e) {}
    document.cookie = 'utm_content=' + encodeURIComponent(value) + '; path=/; max-age=7776000';
  }

  // Synthesize _fbc from fbclid URL param if not already set
  (function () {
    var params = new URLSearchParams(window.location.search);
    var fbclid = params.get('fbclid');
    if (fbclid) {
      var fbc = 'fb.1.' + Date.now() + '.' + fbclid;
      document.cookie = '_fbc=' + fbc + '; path=/; max-age=7776000';
    }
    persistAdCode((params.get('utm_content') || '').trim());
  })();

  // ── Altcha PoW solver (self-contained, no external script) ─────────────────
  //
  // Protocol (altcha-lib v1): challenge = SHA-256(salt + number)
  // The salt already has URL params appended (no separator before number).

  async function solveAltchaChallenge(ch) {
    var algorithm = ch.algorithm || 'SHA-256';
    var challenge = ch.challenge;
    var salt = ch.salt;
    var signature = ch.signature;
    var maxnumber = ch.maxnumber || 1000000;
    var encoder = new TextEncoder();
    for (var i = 0; i <= maxnumber; i++) {
      var buf = await crypto.subtle.digest(
        algorithm.toUpperCase(),
        encoder.encode(salt + i)
      );
      var hex = Array.from(new Uint8Array(buf))
        .map(function (b) { return b.toString(16).padStart(2, '0'); })
        .join('');
      if (hex === challenge) {
        return btoa(JSON.stringify({ algorithm: algorithm, challenge: challenge, number: i, salt: salt, signature: signature }));
      }
    }
    throw new Error('Altcha challenge could not be solved within maxnumber iterations');
  }

  async function fetchAndSolveAltcha() {
    var res = await fetch(apiBase + '/altcha/challenge');
    if (!res.ok) throw new Error('Challenge fetch failed: ' + res.status);
    var ch = await res.json();
    return solveAltchaChallenge(ch);
  }

  // ── Captcha pre-solve ─────────────────────────────────────────────────────
  // Warm up the captcha in the background so it is ready when the user clicks.
  // Uses requestIdleCallback when available, falls back to setTimeout.

  function prepareCaptcha() {
    var idle = typeof requestIdleCallback !== 'undefined'
      ? requestIdleCallback
      : function (fn) { setTimeout(fn, 0); };
    idle(function () {
      return fetchAndSolveAltcha()
        .then(function (payload) {
          _solvedPayload = payload;
          _solvedAt = Date.now();
        })
        .catch(function () {
          // Silent — getReadyCaptcha will solve inline on click if this fails
        });
    });
  }

  // Returns a captcha payload ready to submit.
  // If a pre-solved payload is still fresh (<8 min), consumes it instantly and
  // re-queues a new pre-solve for the next click.
  // Otherwise falls through to an inline solve (slower path).
  function getReadyCaptcha() {
    if (_solvedPayload && (Date.now() - _solvedAt) < CAPTCHA_FRESH_MS) {
      var p = _solvedPayload;
      _solvedPayload = null;
      _solvedAt = 0;
      prepareCaptcha(); // re-queue for the next click
      return Promise.resolve(p);
    }
    return fetchAndSolveAltcha();
  }

  // ── Lead submission ────────────────────────────────────────────────────────

  async function submitLead(btn, waWin) {
    var altcha = await getReadyCaptcha();
    var fbc = getCookie('_fbc') || null;
    var fbp = getCookie('_fbp') || null;
    var adCode = resolveAdCode();
    var url = apiBase + '/api/leads' + (adCode ? '?utm_content=' + encodeURIComponent(adCode) : '');
    var body = {
      landingId: CTA_CONFIG.landingId,
      fbc: fbc,
      fbp: fbp,
      userAgent: navigator.userAgent,
      altcha: altcha,
    };
    if (adCode) body.adCode = adCode;
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status !== 201) throw new Error('Lead creation failed: ' + res.status);
    var data = await res.json();
    var messages = CTA_CONFIG.messages;
    var msg = messages && messages.length > 0
      ? messages[Math.floor(Math.random() * messages.length)]
      : 'Hola';
    var text = encodeURIComponent(msg + ' CODIGO:' + data.code);
    var waUrl = 'https://wa.me/' + data.number + '?text=' + text;

    // Update button label just before navigating (skip for solo-logica — not our button)
    if (btn && ctaMode !== 'solo-logica') {
      setBtnLabel(btn, 'Abriendo WhatsApp\\u2026');
    }

    // Navigate the placeholder tab opened in the click handler.
    // If popup was blocked (waWin is null/undefined), fall back to window.open or location.
    if (waWin) {
      waWin.location.href = waUrl;
    } else {
      var win = window.open ? window.open(waUrl, '_blank') : null;
      if (!win) window.location.href = waUrl;
    }
  }

  // ── Click handler ──────────────────────────────────────────────────────────
  // btn  — the element that triggered the action (for state feedback).
  //
  // solo-logica: owner styles the button via data-cta-state attribute:
  //   [data-cta][data-cta-state='loading'] — request in progress (disabled)
  //   [data-cta][data-cta-state='error']   — submission failed (re-enabled)
  //
  // widget-automontado / boton-flotante: our own button — the label span is
  // updated via setBtnLabel so the injected icon is preserved.

  async function handleClick(e, btn) {
    if (e && e.preventDefault) e.preventDefault();
    if (_submitting) return; // double-click guard
    _submitting = true;

    // Disable the button synchronously — still inside the click gesture, which
    // is required by mobile browsers for popup policy to allow window.open.
    if (btn) {
      btn.disabled = true;
      if (ctaMode === 'solo-logica') {
        btn.setAttribute('data-cta-state', 'loading');
      } else {
        setBtnLabel(btn, 'Conectando\\u2026');
      }
    }

    // Open a placeholder tab synchronously to bypass mobile popup blockers.
    // After the POST we set location.href to the real wa.me URL.
    var waWin = (window.open) ? window.open('about:blank', '_blank') : null;

    try {
      await submitLead(btn, waWin);
      // On success: button stays disabled — WhatsApp is opening.
    } catch (err) {
      console.error('[CTA] click error:', err);
      if (waWin) waWin.close();
      _submitting = false;
      if (btn) {
        btn.disabled = false;
        if (ctaMode === 'solo-logica') {
          btn.setAttribute('data-cta-state', 'error');
        } else {
          setBtnLabel(btn, 'No pudimos conectarte, reintent\\u00e1');
        }
      }
    }
  }

  // ── Brand icon ─────────────────────────────────────────────────────────────
  // Inline SVG of Lucide's "message-circle" — the same icon shown in the
  // dashboard preview. Rendered white via stroke:currentColor + color:#fff.
  function ctaIcon(size) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0">' +
      '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path></svg>';
  }

  // Update a button's visible label WITHOUT wiping an injected icon. Our buttons
  // wrap the label in <span class="cta-label">; owner buttons (solo-logica) and
  // the test mock (no querySelector) fall back to textContent.
  function setBtnLabel(btn, text) {
    var label = btn.querySelector ? btn.querySelector('.cta-label') : null;
    if (label) label.textContent = text;
    else btn.textContent = text;
  }

  // Inject the widget button's default styles ONCE, at zero specificity (:where)
  // so a merchant's own \`.cta-btn\` rules always win — a real override, no
  // !important needed. Guarded on document.head so the test mock is a no-op.
  function ensureWidgetStyles() {
    if (!document.head || document.getElementById('cta-widget-styles')) return;
    var style = document.createElement('style');
    style.setAttribute('id', 'cta-widget-styles');
    style.textContent =
      ':where(.cta-btn){display:inline-flex;align-items:center;justify-content:center;' +
      'gap:8px;background:#25D366;color:#fff;border:none;border-radius:10px;' +
      'padding:12px 22px;font-size:16px;font-weight:600;line-height:1;cursor:pointer;' +
      'box-shadow:0 2px 6px rgba(37,211,102,0.35);}' +
      ':where(.cta-btn:disabled){opacity:0.6;cursor:default;}';
    document.head.appendChild(style);
  }

  // ── Mode: solo-logica ──────────────────────────────────────────────────────
  // Owner markup: own button (matching ctaTarget) + [data-cta-captcha] container.
  // Script only wires the click handler — no DOM injection.
  if (ctaMode === 'solo-logica') {
    var btn = document.querySelector(ctaTarget);
    if (btn) {
      btn.addEventListener('click', function (e) { return handleClick(e, btn); });
      prepareCaptcha();
    }
  }

  // ── Mode: widget-automontado ───────────────────────────────────────────────
  // Owner markup: <div id="cta-root"></div>
  // Script injects a styled button + captcha container into #cta-root.
  else if (ctaMode === 'widget-automontado') {
    var root = document.getElementById('cta-root');
    if (root) {
      var widgetBtn = document.createElement('button');
      widgetBtn.setAttribute('type', 'button');
      widgetBtn.setAttribute('class', 'cta-btn');
      // Default styling comes from an injected zero-specificity stylesheet (see
      // ensureWidgetStyles) so a merchant's own .cta-btn rules override cleanly.
      ensureWidgetStyles();
      widgetBtn.innerHTML = ctaIcon(18) + '<span class="cta-label">Contactarse</span>';
      var captchaContainer = document.createElement('div');
      captchaContainer.setAttribute('data-cta-captcha', '');
      root.appendChild(widgetBtn);
      root.appendChild(captchaContainer);
      widgetBtn.addEventListener('click', function (e) { return handleClick(e, widgetBtn); });
      prepareCaptcha();
    }
  }

  // ── Mode: boton-flotante (FAB + modal) ─────────────────────────────────────
  // Owner markup: none — script injects everything.
  // A fixed floating button (FAB) opens a modal; submit in the modal triggers lead.
  else if (ctaMode === 'boton-flotante') {
    // FAB — fixed, round, WhatsApp green, with the same message-circle icon the
    // dashboard preview shows (replaces the OS-dependent 💬 emoji that rendered
    // inconsistently across browsers).
    var fab = document.createElement('button');
    fab.setAttribute('type', 'button');
    fab.setAttribute('id', 'cta-fab');
    fab.setAttribute('aria-label', 'Contactarse');
    fab.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;border:none;' +
      'cursor:pointer;border-radius:50%;width:56px;height:56px;background:#25D366;color:#fff;' +
      'display:flex;align-items:center;justify-content:center;' +
      'box-shadow:0 6px 16px rgba(0,0,0,0.28);';
    fab.innerHTML = ctaIcon(28);
    document.body.appendChild(fab);

    // Modal — hidden on load via BOTH the [hidden] attribute (semantics/a11y)
    // and inline display:none (visual). The previous version set inline
    // display:flex, which overrode the UA stylesheet's [hidden]{display:none}
    // in the cascade, so the modal appeared on page load. Toggled below.
    var modal = document.createElement('div');
    modal.setAttribute('id', 'cta-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('hidden', '');
    modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.55);' +
      'align-items:center;justify-content:center;padding:16px;';
    modal.style.display = 'none';

    var modalInner = document.createElement('div');
    modalInner.style.cssText = 'position:relative;background:#fff;border-radius:14px;padding:24px;' +
      'width:100%;max-width:340px;display:flex;flex-direction:column;gap:14px;' +
      'box-shadow:0 12px 40px rgba(0,0,0,0.35);';

    var modalTitle = document.createElement('div');
    modalTitle.textContent = 'Contactar por WhatsApp';
    modalTitle.style.cssText = 'font-size:17px;font-weight:700;color:#111827;' +
      'text-align:center;padding:0 16px;';

    var captchaModalDiv = document.createElement('div');
    captchaModalDiv.setAttribute('data-cta-captcha', '');

    var submitBtn = document.createElement('button');
    submitBtn.setAttribute('type', 'button');
    submitBtn.setAttribute('id', 'cta-modal-submit');
    submitBtn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;gap:8px;' +
      'padding:12px 24px;background:#25D366;color:#fff;border:none;border-radius:10px;' +
      'cursor:pointer;font-size:16px;font-weight:600;line-height:1;';
    submitBtn.innerHTML = ctaIcon(18) + '<span class="cta-label">Contactarse</span>';

    var closeBtn = document.createElement('button');
    closeBtn.setAttribute('type', 'button');
    closeBtn.setAttribute('id', 'cta-modal-close');
    closeBtn.setAttribute('aria-label', 'Cerrar');
    closeBtn.style.cssText = 'position:absolute;top:8px;right:10px;background:none;border:none;' +
      'font-size:22px;line-height:1;color:#6b7280;cursor:pointer;';
    closeBtn.textContent = '\\u00D7'; // ×

    modalInner.appendChild(closeBtn);
    modalInner.appendChild(modalTitle);
    modalInner.appendChild(captchaModalDiv);
    modalInner.appendChild(submitBtn);
    modal.appendChild(modalInner);
    document.body.appendChild(modal);

    function openCtaModal() {
      modal.removeAttribute('hidden');
      modal.style.display = 'flex';
    }
    function closeCtaModal() {
      modal.setAttribute('hidden', '');
      modal.style.display = 'none';
    }

    // Open on FAB click; close on × or on a backdrop click (outside the box).
    fab.addEventListener('click', openCtaModal);
    closeBtn.addEventListener('click', closeCtaModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeCtaModal();
    });

    // Submit lead on modal submit button
    submitBtn.addEventListener('click', function (e) { return handleClick(e, submitBtn); });
    prepareCaptcha();
  }

})();
`;
}
