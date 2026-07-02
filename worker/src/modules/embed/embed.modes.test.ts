/**
 * embed.modes.test.ts — Phase 2 task 2.9 + Change B UX improvements
 *
 * Integration tests for the 3 embed runtime modes.
 * Uses Node.js `vm` module to execute the bundle string in a controlled context
 * that mocks DOM APIs, fetch, and window.open.
 *
 * Web Crypto (crypto.subtle) is available via globalThis.crypto in Node 18+.
 * fetch is mocked to return a pre-computed challenge (maxnumber=5, answer=0)
 * so the solver completes in 1 iteration (fast test).
 *
 * Limitation: jsdom-level full DOM integration is NOT available (no jsdom
 * dependency). The vm context provides a minimal mock DOM sufficient to test
 * mode branching, event wiring, and the click → POST leads → window.open flow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

process.env.PORT = process.env.PORT ?? '3002';
process.env.LEADS_CODE_TTL_HOURS = process.env.LEADS_CODE_TTL_HOURS ?? '24';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.BULLMQ_REDIS_URL = process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379';
process.env.BULLMQ_QUEUE_NAME = process.env.BULLMQ_QUEUE_NAME ?? 'test-queue';
process.env.WORKER_CONCURRENCY = process.env.WORKER_CONCURRENCY ?? '1';
process.env.WAHA_API_KEY = process.env.WAHA_API_KEY ?? 'waha-key';
process.env.WAHA_BASE_URL = process.env.WAHA_BASE_URL ?? 'http://localhost:3000';
process.env.WAHA_WEBHOOK_URL = process.env.WAHA_WEBHOOK_URL ?? 'http://localhost:3002/webhook';
process.env.WAHA_WEBHOOK_EVENTS = process.env.WAHA_WEBHOOK_EVENTS ?? 'message';
process.env.WAHA_WEBHOOK_TOKEN_HEADER = process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
process.env.WAHA_WEBHOOK_TOKEN_VALUE = process.env.WAHA_WEBHOOK_TOKEN_VALUE ?? 'token';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? '1234567890123456';
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? 'turnstile-secret';
process.env.ALTCHA_HMAC_SECRET = process.env.ALTCHA_HMAC_SECRET ?? 'test-altcha-hmac-secret-32-bytes!';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

// ---------------------------------------------------------------------------
// Pre-computed challenge fixture (answer = 0, salt = 'testsalt&', maxnumber=5)
// SHA-256('testsalt&0') computed via Node crypto
// ---------------------------------------------------------------------------
const MOCK_SALT = 'testsalt?expires=9999999999&';
const MOCK_NUMBER = 0;
const MOCK_CHALLENGE_HASH = createHash('sha256')
  .update(MOCK_SALT + MOCK_NUMBER)
  .digest('hex');

const MOCK_CHALLENGE = {
  algorithm: 'SHA-256',
  challenge: MOCK_CHALLENGE_HASH,
  salt: MOCK_SALT,
  signature: 'mock-signature-for-testing',
  maxnumber: 5,
};

const MOCK_LEAD_RESPONSE = { code: 'TESTCODE123', number: '5491123456789' };

const TEST_CONFIG = {
  landingId: 'test-landing-vm-123',
  pixelId: '976916338006290',
  messages: ['Hola quiero info', 'Vengo del anuncio'],
};

// ---------------------------------------------------------------------------
// VM context factory
// ---------------------------------------------------------------------------

type MockWaWin = {
  location: { href: string };
  close: () => void;
};

type MockContext = {
  context: vm.Context;
  /** Final URL navigated to (waWin.location.href if popup approach, else last window.open arg) */
  getWindowOpen: () => string | undefined;
  /** All arguments passed to window.open(), in order */
  getWindowOpenCalls: () => string[];
  /** The mock window object returned by window.open */
  getMockWaWin: () => MockWaWin;
  getFetchCalls: () => string[];
  /** Returns the mutable sandbox window object — inspect fbq, __ctaEmbedInit, etc. after bundle run */
  getWindow: () => Record<string, unknown>;
  document: {
    querySelector: (sel: string) => MockElement | null;
    getElementById: (id: string) => MockElement | null;
    body: MockElement;
    currentScript: {
      src: string;
      getAttribute: (name: string) => string | null;
    };
  };
};

type MockElement = {
  _tag: string;
  _attrs: Record<string, string>;
  _listeners: Record<string, (...args: unknown[]) => unknown>;
  _children: MockElement[];
  style: { cssText: string; display?: string };
  textContent: string;
  disabled: boolean;
  hidden: boolean;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  addEventListener: (event: string, fn: (...args: unknown[]) => unknown) => void;
  appendChild: (child: MockElement) => void;
};

function makeMockElement(tag: string): MockElement {
  const el: MockElement = {
    _tag: tag,
    _attrs: {},
    _listeners: {},
    _children: [],
    style: { cssText: '' },
    textContent: '',
    disabled: false,
    hidden: false,
    getAttribute(name) { return this._attrs[name] ?? null; },
    setAttribute(name, value) { this._attrs[name] = value; },
    removeAttribute(name) { delete this._attrs[name]; },
    addEventListener(event, fn) { this._listeners[event] = fn; },
    appendChild(child) { this._children.push(child); },
  };
  return el;
}

type VmContextOptions = {
  /** When true, the /api/leads mock returns HTTP 500 (simulates a submit failure) */
  failLeads?: boolean;
  /** Override requestIdleCallback in the VM context (captures the idle fn for testing pre-solve) */
  requestIdleCallback?: (fn: () => unknown) => void;
  /** Value for data-cta-pixel attribute on currentScript (null = attribute absent → 'auto') */
  ctaPixelAttr?: string | null;
  /** Pre-existing window.fbq — simulates a pixel already bootstrapped on the page */
  preExistingFbq?: (...args: unknown[]) => void;
};

function createVmContext(ctaMode: string, options?: VmContextOptions): MockContext {
  const windowOpenCalls: string[] = [];
  const fetchCalls: string[] = [];

  // Mock window object returned by window.open — represents the opened tab.
  // The bundle sets location.href on this after the POST completes.
  const mockWaWin: MockWaWin = {
    location: { href: 'about:blank' },
    close: () => { mockWaWin.location.href = 'about:blank'; },
  };

  // Elements registry: querySelector and getElementById lookup
  const elements = new Map<string, MockElement>();

  // Body element
  const body = makeMockElement('body');

  const mockDoc = {
    currentScript: {
      src: 'https://example.com/embed/test-landing-vm-123.js',
      getAttribute(name: string): string | null {
        if (name === 'data-cta-mode') return ctaMode;
        if (name === 'data-cta-target') return null;
        if (name === 'data-cta-pixel') return options?.ctaPixelAttr ?? null;
        return null;
      },
    },
    cookie: '_fbc=fb.1.123.abc; _fbp=fb.2.456',
    querySelector(selector: string): MockElement | null {
      return elements.get(selector) ?? null;
    },
    getElementById(id: string): MockElement | null {
      return elements.get(`#${id}`) ?? null;
    },
    createElement(tag: string): MockElement {
      return makeMockElement(tag);
    },
    // Returns empty array — no real script elements in mock DOM.
    // The pixel bootstrap checks the result before using it, so no error is thrown.
    getElementsByTagName(_tag: string): MockElement[] {
      return [];
    },
    body,
  };

  // Register elements that the bundle expects to find in the DOM
  if (ctaMode === 'solo-logica') {
    // solo-logica: owner provides [data-cta] button
    const btn = makeMockElement('button');
    elements.set('[data-cta]', btn);
  } else if (ctaMode === 'widget-automontado') {
    // widget-automontado: owner provides <div id="cta-root">
    const root = makeMockElement('div');
    elements.set('#cta-root', root);
  }
  // boton-flotante: no owner markup — script creates everything via document.body.appendChild

  const mockFetch = async (url: string, _init?: unknown): Promise<unknown> => {
    fetchCalls.push(url);
    if (typeof url === 'string' && url.includes('/altcha/challenge')) {
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_CHALLENGE,
      };
    }
    if (typeof url === 'string' && url.includes('/api/leads')) {
      if (options?.failLeads) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 201,
        json: async () => MOCK_LEAD_RESPONSE,
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  // Mutable window object — bundle can set window.fbq, window.__ctaEmbedInit, etc.
  // Exposed via getWindow() so tests can inspect state after bundle execution.
  const win: Record<string, unknown> = {
    location: { search: '', href: '' },
    open(url: string) {
      windowOpenCalls.push(url);
      return mockWaWin;
    },
  };
  if (options?.preExistingFbq) {
    win.fbq = options.preExistingFbq;
  }

  // Build the sandbox — requestIdleCallback is injected only when provided via options
  // (so typeof checks in the bundle correctly fall back to setTimeout when omitted).
  const sandbox: Record<string, unknown> = {
    document: mockDoc,
    window: win,
    navigator: { userAgent: 'vm-test-agent' },
    fetch: mockFetch,
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    // Web Crypto — available in Node 18+
    crypto: globalThis.crypto,
    // Standard globals needed in the bundle
    URL: globalThis.URL,
    URLSearchParams: globalThis.URLSearchParams,
    TextEncoder: globalThis.TextEncoder,
    Uint8Array: globalThis.Uint8Array,
    Array: globalThis.Array,
    JSON: globalThis.JSON,
    Math: globalThis.Math,
    Date: globalThis.Date,
    parseInt: globalThis.parseInt,
    parseFloat: globalThis.parseFloat,
    console: console,
    encodeURIComponent: globalThis.encodeURIComponent,
    decodeURIComponent: globalThis.decodeURIComponent,
    btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
    Error: globalThis.Error,
    Promise: globalThis.Promise,
    TypeError: globalThis.TypeError,
    // No-op setTimeout — prepareCaptcha falls back to it; idle callback never fires automatically.
    // Tests that need pre-solve inject requestIdleCallback explicitly via options.
    setTimeout: (_fn: () => void, _delay?: number) => {},
  };

  if (options?.requestIdleCallback) {
    sandbox.requestIdleCallback = options.requestIdleCallback;
  }

  const context = vm.createContext(sandbox);

  return {
    context,
    getWindowOpen: () => {
      // Prefer the URL set on waWin.location.href (popup flow)
      const href = mockWaWin.location.href;
      if (href && href !== 'about:blank') return href;
      // Fallback: a direct window.open call with a non-blank URL (blocked-popup path)
      return windowOpenCalls.find(u => u !== 'about:blank' && u.includes('wa.me'));
    },
    getWindowOpenCalls: () => windowOpenCalls,
    getMockWaWin: () => mockWaWin,
    getFetchCalls: () => fetchCalls,
    getWindow: () => win,
    document: mockDoc as unknown as MockContext['document'],
  };
}

// ---------------------------------------------------------------------------
// Mode 1: solo-logica
// ---------------------------------------------------------------------------

test('solo-logica mode: bundle wires click on [data-cta] → window.open wa.me with CODIGO', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundleCode = renderEmbedBundle(TEST_CONFIG);

  const ctx = createVmContext('solo-logica');

  // Execute the bundle (registers click listener on [data-cta] button)
  vm.runInContext(bundleCode, ctx.context);

  // Find the [data-cta] button that should now have a click listener
  const btn = ctx.document.querySelector('[data-cta]') as MockElement;
  assert.ok(btn, '[data-cta] button must exist in DOM');
  assert.ok(
    typeof btn._listeners['click'] === 'function',
    'solo-logica must wire a click listener on [data-cta]',
  );

  // Trigger the click handler and await the async chain
  await (btn._listeners['click'] as () => Promise<void>)();

  // Assert window.open was called with correct wa.me URL
  const waUrl = ctx.getWindowOpen();
  assert.ok(waUrl !== undefined, 'window.open must be called after click');
  assert.ok(waUrl!.startsWith('https://wa.me/'), `URL must start with https://wa.me/, got: ${waUrl}`);
  assert.ok(waUrl!.includes(MOCK_LEAD_RESPONSE.number), 'URL must contain the phone number');
  assert.ok(waUrl!.includes('CODIGO%3A' + MOCK_LEAD_RESPONSE.code) ||
    waUrl!.includes('CODIGO:' + MOCK_LEAD_RESPONSE.code) ||
    decodeURIComponent(waUrl!).includes('CODIGO:' + MOCK_LEAD_RESPONSE.code),
    `URL must contain CODIGO:${MOCK_LEAD_RESPONSE.code}, got: ${waUrl}`,
  );
});

// ---------------------------------------------------------------------------
// Mode 2: widget-automontado
// ---------------------------------------------------------------------------

test('widget-automontado mode: bundle injects button into #cta-root and wires click → window.open', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundleCode = renderEmbedBundle(TEST_CONFIG);

  const ctx = createVmContext('widget-automontado');

  // Execute the bundle (should inject into #cta-root)
  vm.runInContext(bundleCode, ctx.context);

  // The root element should have children (injected button + captcha div)
  const root = ctx.document.getElementById('cta-root') as MockElement;
  assert.ok(root, '#cta-root must exist in DOM');
  assert.ok(root._children.length >= 1, '#cta-root must have injected children (button at minimum)');

  // Find the injected button (first child)
  const widgetBtn = root._children[0];
  assert.ok(widgetBtn, 'injected button must exist in #cta-root');
  assert.ok(
    typeof widgetBtn._listeners['click'] === 'function',
    'widget-automontado must wire a click listener on the injected button',
  );

  // Trigger click
  await (widgetBtn._listeners['click'] as () => Promise<void>)();

  const waUrl = ctx.getWindowOpen();
  assert.ok(waUrl !== undefined, 'window.open must be called after widget button click');
  assert.ok(waUrl!.startsWith('https://wa.me/'), `URL must start with https://wa.me/, got: ${waUrl}`);
  assert.ok(waUrl!.includes(MOCK_LEAD_RESPONSE.number), 'URL must contain the phone number');
  assert.ok(
    decodeURIComponent(waUrl!).includes('CODIGO:' + MOCK_LEAD_RESPONSE.code),
    `URL must contain CODIGO:${MOCK_LEAD_RESPONSE.code}`,
  );
});

// ---------------------------------------------------------------------------
// Mode 3: boton-flotante
// ---------------------------------------------------------------------------

test('boton-flotante mode: bundle injects a FAB (no modal); FAB click → lead POST → window.open', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundleCode = renderEmbedBundle(TEST_CONFIG);

  const ctx = createVmContext('boton-flotante');

  // Execute the bundle (should append the FAB to document.body)
  vm.runInContext(bundleCode, ctx.context);

  const body = ctx.document.body as MockElement;
  assert.ok(body._children.length >= 1, 'body must have the FAB child');

  // The FAB — icon-only, wired straight to the lead flow (no modal step).
  const fab = body._children[0];
  assert.ok(fab, 'FAB element must exist');
  assert.equal(fab._attrs['id'], 'cta-fab', 'FAB must have id="cta-fab"');
  assert.ok(typeof fab._listeners['click'] === 'function', 'FAB must have a click listener');

  // Regression guard: the modal was removed — clicking the FAB opens WhatsApp
  // directly instead of showing a middle-of-screen popup. Nothing with
  // id="cta-modal" must be injected anymore.
  const modal = body._children.find((c) => c._attrs['id'] === 'cta-modal');
  assert.ok(!modal, 'no modal must be injected — the FAB opens WhatsApp directly');

  // Trigger the FAB click → lead POST → window.open (no intermediate submit).
  await (fab._listeners['click'] as () => Promise<void>)();

  const waUrl = ctx.getWindowOpen();
  assert.ok(waUrl !== undefined, 'window.open must be called after FAB click');
  assert.ok(waUrl!.startsWith('https://wa.me/'), `URL must start with https://wa.me/, got: ${waUrl}`);
  assert.ok(waUrl!.includes(MOCK_LEAD_RESPONSE.number), 'URL must contain the phone number');
  assert.ok(
    decodeURIComponent(waUrl!).includes('CODIGO:' + MOCK_LEAD_RESPONSE.code),
    `URL must contain CODIGO:${MOCK_LEAD_RESPONSE.code}`,
  );
});

// ---------------------------------------------------------------------------
// Guard: double-click produces only one POST
// ---------------------------------------------------------------------------

test('double-click guard: two rapid clicks produce only one POST /api/leads', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundleCode = renderEmbedBundle(TEST_CONFIG);

  const ctx = createVmContext('solo-logica');
  vm.runInContext(bundleCode, ctx.context);

  const btn = ctx.document.querySelector('[data-cta]') as MockElement;
  assert.ok(btn, '[data-cta] button must exist');

  // Fire two clicks without awaiting the first.
  // handleClick runs synchronously until its first `await submitLead(...)`,
  // at which point _submitting is already true and the second click returns immediately.
  const p1 = (btn._listeners['click'] as () => Promise<void>)();
  const p2 = (btn._listeners['click'] as () => Promise<void>)(); // guard fires, returns immediately

  await p1;
  await p2; // resolves immediately (guard returned early)

  const leadPosts = ctx.getFetchCalls().filter(u => u.includes('/api/leads'));
  assert.equal(leadPosts.length, 1, 'only one POST /api/leads must be made despite two clicks');
  assert.equal(btn.disabled, true, 'button must remain disabled after successful submit');
});

// ---------------------------------------------------------------------------
// Guard: button disabled synchronously on click (before any network call)
// ---------------------------------------------------------------------------

test('click immediately disables button synchronously before any await', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundleCode = renderEmbedBundle(TEST_CONFIG);

  const ctx = createVmContext('solo-logica');
  vm.runInContext(bundleCode, ctx.context);

  const btn = ctx.document.querySelector('[data-cta]') as MockElement;

  // Start the click but do NOT await — inspect state between sync and async parts.
  // handleClick runs synchronously until 'await submitLead(...)', setting disabled=true first.
  const clickPromise = (btn._listeners['click'] as () => Promise<void>)();

  assert.equal(btn.disabled, true, 'button must be disabled synchronously on click');
  assert.equal(
    btn._attrs['data-cta-state'],
    'loading',
    'solo-logica: data-cta-state must be "loading" synchronously',
  );

  await clickPromise;
});

// ---------------------------------------------------------------------------
// Feedback: error state re-enables button — solo-logica
// ---------------------------------------------------------------------------

test('submitLead error: solo-logica button re-enabled with data-cta-state="error"', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundleCode = renderEmbedBundle(TEST_CONFIG);

  const ctx = createVmContext('solo-logica', { failLeads: true });
  vm.runInContext(bundleCode, ctx.context);

  const btn = ctx.document.querySelector('[data-cta]') as MockElement;
  await (btn._listeners['click'] as () => Promise<void>)();

  assert.equal(btn.disabled, false, 'button must be re-enabled after lead submission error');
  assert.equal(
    btn._attrs['data-cta-state'],
    'error',
    'solo-logica: data-cta-state must be "error" after failure',
  );
});

// ---------------------------------------------------------------------------
// Feedback: error state re-enables button — widget-automontado
// ---------------------------------------------------------------------------

test('submitLead error: widget-automontado button re-enabled with retry text', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundleCode = renderEmbedBundle(TEST_CONFIG);

  const ctx = createVmContext('widget-automontado', { failLeads: true });
  vm.runInContext(bundleCode, ctx.context);

  const root = ctx.document.getElementById('cta-root') as MockElement;
  const widgetBtn = root._children[0];
  await (widgetBtn._listeners['click'] as () => Promise<void>)();

  assert.equal(widgetBtn.disabled, false, 'button must be re-enabled after error');
  assert.ok(
    widgetBtn.textContent.includes('reintent'),
    `error textContent must ask user to retry, got: "${widgetBtn.textContent}"`,
  );
});

// ---------------------------------------------------------------------------
// Pre-solve: background challenge fetch used on first click (no extra call)
// ---------------------------------------------------------------------------

test('pre-solve: idle callback fetches challenge in background; click consumes cached payload', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundleCode = renderEmbedBundle(TEST_CONFIG);

  let capturedIdleCallback: (() => unknown) | undefined;
  const ctx = createVmContext('solo-logica', {
    requestIdleCallback: (fn) => { capturedIdleCallback = fn as () => unknown; },
  });

  vm.runInContext(bundleCode, ctx.context);

  // Bundle ran → prepareCaptcha() called → requestIdleCallback captured the fn
  assert.ok(capturedIdleCallback, 'prepareCaptcha must have queued an idle callback');

  // Trigger the idle callback manually and await the async solve
  // (the fn returns the promise from fetchAndSolveAltcha().then(...))
  await capturedIdleCallback!();

  // One challenge fetch happened in the background
  const challengesBefore = ctx.getFetchCalls().filter(u => u.includes('/altcha/challenge')).length;
  assert.equal(challengesBefore, 1, 'one challenge fetch must have happened during idle pre-solve');

  // Now click — should use the cached payload, no new challenge fetch
  const btn = ctx.document.querySelector('[data-cta]') as MockElement;
  await (btn._listeners['click'] as () => Promise<void>)();

  const challengesAfter = ctx.getFetchCalls().filter(u => u.includes('/altcha/challenge')).length;
  assert.equal(
    challengesAfter,
    1,
    'click must reuse pre-solved payload — no extra /altcha/challenge fetch',
  );

  const leadCalls = ctx.getFetchCalls().filter(u => u.includes('/api/leads')).length;
  assert.equal(leadCalls, 1, 'one lead POST must have been made');
});

// ---------------------------------------------------------------------------
// Popup anti-blocking: about:blank opened synchronously; wa.me via location.href
// ---------------------------------------------------------------------------

test('popup: window.open("about:blank") called first; waWin.location.href set to wa.me after POST', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundleCode = renderEmbedBundle(TEST_CONFIG);

  const ctx = createVmContext('solo-logica');
  vm.runInContext(bundleCode, ctx.context);

  const btn = ctx.document.querySelector('[data-cta]') as MockElement;

  // Start click — synchronous part opens about:blank before any network call
  const clickPromise = (btn._listeners['click'] as () => Promise<void>)();

  // Synchronously after click: first window.open call must be about:blank
  assert.equal(
    ctx.getWindowOpenCalls()[0],
    'about:blank',
    'first window.open call must be "about:blank" (sync, before POST)',
  );

  await clickPromise;

  // After POST: waWin.location.href must be the wa.me URL
  const waWin = ctx.getMockWaWin();
  assert.ok(
    waWin.location.href.startsWith('https://wa.me/'),
    `waWin.location.href must be wa.me URL, got: ${waWin.location.href}`,
  );
  assert.ok(
    waWin.location.href.includes(MOCK_LEAD_RESPONSE.number),
    'wa.me URL must contain the phone number',
  );
});

// ---------------------------------------------------------------------------
// Pixel-init: auto-init
// ---------------------------------------------------------------------------

test('pixel-init: valid pixelId without opt-out → fbq init and trackSingle called, not track', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundleCode = renderEmbedBundle(TEST_CONFIG); // pixelId = '976916338006290' (valid)

  const ctx = createVmContext('solo-logica'); // no preExistingFbq, no ctaPixelAttr
  vm.runInContext(bundleCode, ctx.context);

  // The bundle bootstraps window.fbq because it was undefined. Inspect its call queue.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fbq = ctx.getWindow().fbq as any;
  assert.ok(fbq, 'window.fbq must be defined after pixel-init bootstrap');
  assert.ok(Array.isArray(fbq.queue), 'fbq.queue must be an array');

  const queue: unknown[][] = fbq.queue;
  const initCall = queue.find(a => a[0] === 'init');
  assert.ok(initCall, 'fbq("init", pixelId) must be called');
  assert.equal(initCall![1], TEST_CONFIG.pixelId, 'init must use the pixelId from CTA_CONFIG');

  const trackSingleCall = queue.find(a => a[0] === 'trackSingle');
  assert.ok(trackSingleCall, 'fbq("trackSingle", pixelId, "PageView") must be called');
  assert.equal(trackSingleCall![1], TEST_CONFIG.pixelId);
  assert.equal(trackSingleCall![2], 'PageView');

  // trackSingle (not track) — scoped to our pixel only, does not fire for other pixels
  const trackCall = queue.find(a => a[0] === 'track');
  assert.ok(!trackCall, 'fbq("track") must NOT be called — must use trackSingle for pixel isolation');
});

// ---------------------------------------------------------------------------
// Pixel-init: opt-out
// ---------------------------------------------------------------------------

test('pixel-init: data-cta-pixel="off" → fbq init/trackSingle NOT called', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundleCode = renderEmbedBundle(TEST_CONFIG);

  const fbqCalls: unknown[][] = [];
  const fbqSpy = (...args: unknown[]) => { fbqCalls.push(args); };

  const ctx = createVmContext('solo-logica', { ctaPixelAttr: 'off', preExistingFbq: fbqSpy });
  vm.runInContext(bundleCode, ctx.context);

  const initCalls = fbqCalls.filter(a => a[0] === 'init');
  const trackCalls = fbqCalls.filter(a => a[0] === 'trackSingle' || a[0] === 'track');
  assert.equal(initCalls.length, 0, 'fbq("init") must NOT be called when data-cta-pixel="off"');
  assert.equal(trackCalls.length, 0, 'fbq page-view must NOT be called when data-cta-pixel="off"');
});

// ---------------------------------------------------------------------------
// Pixel-init: idempotence guard
// ---------------------------------------------------------------------------

test('idempotence: running bundle twice → pixel-init fires once, CTA wired once', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundleCode = renderEmbedBundle(TEST_CONFIG);

  const ctx = createVmContext('solo-logica');

  // First run — init fires, __ctaEmbedInit set to true
  vm.runInContext(bundleCode, ctx.context);
  // Second run — guard fires immediately, no double-init
  vm.runInContext(bundleCode, ctx.context);

  const win = ctx.getWindow();
  assert.equal((win as Record<string, unknown>).__ctaEmbedInit, true, 'guard flag must be set');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queue: unknown[][] = (win.fbq as any)?.queue ?? [];
  const initCalls = queue.filter(a => a[0] === 'init');
  assert.equal(initCalls.length, 1, 'fbq("init") must fire exactly once despite two bundle runs');

  // CTA is still wired (registered on the first run, not duplicated on the second)
  const btn = ctx.document.querySelector('[data-cta]') as MockElement;
  assert.ok(typeof btn._listeners['click'] === 'function', 'CTA click listener must be wired');
});

// ---------------------------------------------------------------------------
// Pixel-init: resilience — fbq throws
// ---------------------------------------------------------------------------

test('resilience: window.fbq throws → bundle does not throw, CTA is still wired', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundleCode = renderEmbedBundle(TEST_CONFIG);

  // Pre-existing fbq that throws on every call
  const throwingFbq = (..._args: unknown[]) => { throw new Error('fbq unavailable in test'); };
  const ctx = createVmContext('solo-logica', { preExistingFbq: throwingFbq });

  // The bundle must not propagate the fbq exception
  assert.doesNotThrow(
    () => { vm.runInContext(bundleCode, ctx.context); },
    'bundle must not throw when window.fbq throws',
  );

  // CTA must still be wired despite pixel failure
  const btn = ctx.document.querySelector('[data-cta]') as MockElement;
  assert.ok(btn, '[data-cta] button must exist');
  assert.ok(
    typeof btn._listeners['click'] === 'function',
    'CTA click listener must still be wired after fbq failure',
  );
});

// ---------------------------------------------------------------------------
// Pixel-init: invalid pixelId
// ---------------------------------------------------------------------------

test('pixel-init: empty pixelId → fbq NOT called, lead flow unaffected', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const invalidConfig = { ...TEST_CONFIG, pixelId: '' };
  const bundleCode = renderEmbedBundle(invalidConfig);

  const fbqCalls: unknown[][] = [];
  const ctx = createVmContext('solo-logica', { preExistingFbq: (...a) => { fbqCalls.push(a); } });
  vm.runInContext(bundleCode, ctx.context);

  assert.equal(fbqCalls.filter(a => a[0] === 'init').length, 0,
    'fbq("init") must NOT be called for empty pixelId');

  // CTA flow unaffected — lead submission still wired
  const btn = ctx.document.querySelector('[data-cta]') as MockElement;
  assert.ok(typeof btn._listeners['click'] === 'function', 'CTA must still be wired');
});

test('pixel-init: non-numeric pixelId ("-") → fbq NOT called', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const invalidConfig = { ...TEST_CONFIG, pixelId: '-' };
  const bundleCode = renderEmbedBundle(invalidConfig);

  const fbqCalls: unknown[][] = [];
  const ctx = createVmContext('solo-logica', { preExistingFbq: (...a) => { fbqCalls.push(a); } });
  vm.runInContext(bundleCode, ctx.context);

  assert.equal(fbqCalls.filter(a => a[0] === 'init').length, 0,
    'fbq("init") must NOT be called for non-numeric pixelId "-"');
});

// ---------------------------------------------------------------------------
// Pixel-init: pre-existing fbq (no re-bootstrap)
// ---------------------------------------------------------------------------

test('pixel-init: pre-existing window.fbq → no re-bootstrap, but init+trackSingle called', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundleCode = renderEmbedBundle(TEST_CONFIG);

  const fbqCalls: unknown[][] = [];
  const existingFbq = (...args: unknown[]) => { fbqCalls.push(args); };

  const ctx = createVmContext('solo-logica', { preExistingFbq: existingFbq });
  vm.runInContext(bundleCode, ctx.context);

  // fbq must NOT be replaced by the bundle (pre-existing wins)
  assert.strictEqual(ctx.getWindow().fbq, existingFbq, 'window.fbq must not be replaced');

  // But init+trackSingle must still be called on the pre-existing fbq
  const initCalls = fbqCalls.filter(a => a[0] === 'init');
  assert.equal(initCalls.length, 1, 'fbq("init") must be called exactly once');
  assert.equal(initCalls[0]![1], TEST_CONFIG.pixelId, 'init must pass the correct pixelId');

  const trackCalls = fbqCalls.filter(a => a[0] === 'trackSingle');
  assert.equal(trackCalls.length, 1, 'fbq("trackSingle") must be called exactly once');
  assert.equal(trackCalls[0]![2], 'PageView', 'trackSingle must pass "PageView"');
});
