import { createHash } from 'node:crypto';

/**
 * Embed bundle runtime version.
 * Bump this constant to invalidate all ETags globally (forces CDN re-fetch
 * after a runtime logic change, independent of per-landing config changes).
 */
export const RUNTIME_VERSION = '1.0.0';

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

  // Capture currentScript synchronously at the top.
  // Must be classic script (not module) — currentScript is null in modules and async callbacks.
  var _cs = document.currentScript;
  var apiBase = _cs ? new URL(_cs.src).origin : '';
  var ctaMode = (_cs && _cs.getAttribute('data-cta-mode')) || 'solo-logica';
  var ctaTarget = (_cs && _cs.getAttribute('data-cta-target')) || '[data-cta]';

  // Public config — baked at bundle generation time. No server secrets included.
  var CTA_CONFIG = ${configJson};

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

  // ── Lead submission ────────────────────────────────────────────────────────

  async function submitLead() {
    var altcha = await fetchAndSolveAltcha();
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
    window.open('https://wa.me/' + data.number + '?text=' + text, '_blank');
  }

  async function handleClick(e) {
    if (e && e.preventDefault) e.preventDefault();
    try {
      await submitLead();
    } catch (err) {
      console.error('[CTA] click error:', err);
    }
  }

  // ── Mode: solo-logica ──────────────────────────────────────────────────────
  // Owner markup: own button (matching ctaTarget) + [data-cta-captcha] container.
  // Script only wires the click handler — no DOM injection.
  if (ctaMode === 'solo-logica') {
    var btn = document.querySelector(ctaTarget);
    if (btn) btn.addEventListener('click', handleClick);
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
      widgetBtn.textContent = 'Contactarse';
      var captchaContainer = document.createElement('div');
      captchaContainer.setAttribute('data-cta-captcha', '');
      root.appendChild(widgetBtn);
      root.appendChild(captchaContainer);
      widgetBtn.addEventListener('click', handleClick);
    }
  }

  // ── Mode: boton-flotante (FAB + modal) ─────────────────────────────────────
  // Owner markup: none — script injects everything.
  // A fixed floating button (FAB) opens a modal; submit in the modal triggers lead.
  // Captcha container is lazy-initialized inside the modal on first open.
  else if (ctaMode === 'boton-flotante') {
    // FAB
    var fab = document.createElement('button');
    fab.setAttribute('type', 'button');
    fab.setAttribute('id', 'cta-fab');
    fab.setAttribute('aria-label', 'Contactarse');
    fab.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;border:none;' +
      'cursor:pointer;border-radius:50%;width:56px;height:56px;background:#25D366;' +
      'color:#fff;font-size:24px;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
    fab.textContent = '\\u{1F4AC}'; // 💬
    document.body.appendChild(fab);

    // Modal (hidden initially)
    var modal = document.createElement('div');
    modal.setAttribute('id', 'cta-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('hidden', '');
    modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.5);' +
      'display:flex;align-items:center;justify-content:center;';

    var modalInner = document.createElement('div');
    modalInner.style.cssText = 'background:#fff;border-radius:8px;padding:24px;min-width:280px;' +
      'display:flex;flex-direction:column;gap:12px;';

    var captchaModalDiv = document.createElement('div');
    captchaModalDiv.setAttribute('data-cta-captcha', '');

    var submitBtn = document.createElement('button');
    submitBtn.setAttribute('type', 'button');
    submitBtn.setAttribute('id', 'cta-modal-submit');
    submitBtn.style.cssText = 'padding:12px 24px;background:#25D366;color:#fff;border:none;' +
      'border-radius:6px;cursor:pointer;font-size:16px;';
    submitBtn.textContent = 'Contactarse';

    var closeBtn = document.createElement('button');
    closeBtn.setAttribute('type', 'button');
    closeBtn.setAttribute('id', 'cta-modal-close');
    closeBtn.setAttribute('aria-label', 'Cerrar');
    closeBtn.style.cssText = 'position:absolute;top:8px;right:12px;background:none;border:none;' +
      'font-size:20px;cursor:pointer;';
    closeBtn.textContent = '\\u00D7'; // ×

    modalInner.appendChild(captchaModalDiv);
    modalInner.appendChild(submitBtn);
    modal.appendChild(closeBtn);
    modal.appendChild(modalInner);
    document.body.appendChild(modal);

    // Open modal on FAB click (captcha mounts lazily inside modal)
    fab.addEventListener('click', function () {
      modal.removeAttribute('hidden');
    });

    // Close modal on close button
    closeBtn.addEventListener('click', function () {
      modal.setAttribute('hidden', '');
    });

    // Submit lead on modal submit button
    submitBtn.addEventListener('click', handleClick);
  }

})();
`;
}
