/**
 * embed.modes.test.ts — Phase 2 task 2.9
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

type MockContext = {
  context: vm.Context;
  getWindowOpen: () => string | undefined;
  getFetchCalls: () => string[];
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
  style: { cssText: string };
  textContent: string;
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
    hidden: false,
    getAttribute(name) { return this._attrs[name] ?? null; },
    setAttribute(name, value) { this._attrs[name] = value; },
    removeAttribute(name) { delete this._attrs[name]; },
    addEventListener(event, fn) { this._listeners[event] = fn; },
    appendChild(child) { this._children.push(child); },
  };
  return el;
}

function createVmContext(ctaMode: string): MockContext {
  let windowOpenUrl: string | undefined;
  const fetchCalls: string[] = [];

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

  const mockFetch = async (url: string, init?: unknown): Promise<unknown> => {
    fetchCalls.push(url);
    if (typeof url === 'string' && url.includes('/altcha/challenge')) {
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_CHALLENGE,
      };
    }
    if (typeof url === 'string' && url.includes('/api/leads')) {
      return {
        ok: true,
        status: 201,
        json: async () => MOCK_LEAD_RESPONSE,
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const context = vm.createContext({
    document: mockDoc,
    window: {
      location: { search: '' },
      open(url: string) { windowOpenUrl = url; },
    },
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
  });

  return {
    context,
    getWindowOpen: () => windowOpenUrl,
    getFetchCalls: () => fetchCalls,
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

test('boton-flotante mode: bundle injects FAB and modal; modal submit click → window.open', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundleCode = renderEmbedBundle(TEST_CONFIG);

  const ctx = createVmContext('boton-flotante');

  // Execute the bundle (should append FAB + modal to document.body)
  vm.runInContext(bundleCode, ctx.context);

  const body = ctx.document.body as MockElement;
  assert.ok(body._children.length >= 2, 'body must have at least 2 children (FAB + modal)');

  // First child: FAB button
  const fab = body._children[0];
  assert.ok(fab, 'FAB element must exist');
  assert.equal(fab._attrs['id'], 'cta-fab', 'FAB must have id="cta-fab"');
  assert.ok(typeof fab._listeners['click'] === 'function', 'FAB must have a click listener');

  // Trigger FAB click (opens modal)
  (fab._listeners['click'] as () => void)();

  // Second child: modal
  const modal = body._children[1];
  assert.ok(modal, 'Modal element must exist');
  assert.equal(modal._attrs['id'], 'cta-modal', 'modal must have id="cta-modal"');
  // After FAB click, modal should no longer have hidden attribute
  assert.ok(!('hidden' in modal._attrs), 'modal must be visible after FAB click');

  // Find submit button inside modal (nested inside modalInner)
  // Structure: modal > [closeBtn, modalInner > [captchaDiv, submitBtn]]
  // The submit button is the last child of modalInner
  let submitBtn: MockElement | undefined;
  function findById(el: MockElement, id: string): MockElement | undefined {
    if (el._attrs['id'] === id) return el;
    for (const child of el._children) {
      const found = findById(child, id);
      if (found) return found;
    }
    return undefined;
  }
  submitBtn = findById(modal, 'cta-modal-submit');
  assert.ok(submitBtn, 'modal submit button (id="cta-modal-submit") must exist');
  assert.ok(
    typeof submitBtn!._listeners['click'] === 'function',
    'modal submit button must have a click listener',
  );

  // Trigger submit click → lead POST → window.open
  await (submitBtn!._listeners['click'] as () => Promise<void>)();

  const waUrl = ctx.getWindowOpen();
  assert.ok(waUrl !== undefined, 'window.open must be called after modal submit click');
  assert.ok(waUrl!.startsWith('https://wa.me/'), `URL must start with https://wa.me/, got: ${waUrl}`);
  assert.ok(waUrl!.includes(MOCK_LEAD_RESPONSE.number), 'URL must contain the phone number');
  assert.ok(
    decodeURIComponent(waUrl!).includes('CODIGO:' + MOCK_LEAD_RESPONSE.code),
    `URL must contain CODIGO:${MOCK_LEAD_RESPONSE.code}`,
  );
});
