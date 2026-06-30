import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Env stubs — must appear before any module imports that call config
// ---------------------------------------------------------------------------
process.env.PORT = process.env.PORT ?? '3002';
process.env.LEADS_CODE_TTL_HOURS = process.env.LEADS_CODE_TTL_HOURS ?? '24';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.BULLMQ_REDIS_URL = process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379';
process.env.BULLMQ_QUEUE_NAME = process.env.BULLMQ_QUEUE_NAME ?? 'test-queue';
process.env.WORKER_CONCURRENCY = process.env.WORKER_CONCURRENCY ?? '1';
process.env.WAHA_API_KEY = process.env.WAHA_API_KEY ?? 'waha-key';
process.env.WAHA_BASE_URL = process.env.WAHA_BASE_URL ?? 'http://localhost:3000';
process.env.WAHA_WEBHOOK_URL =
  process.env.WAHA_WEBHOOK_URL ?? 'http://localhost:3002/webhook';
process.env.WAHA_WEBHOOK_EVENTS = process.env.WAHA_WEBHOOK_EVENTS ?? 'message';
process.env.WAHA_WEBHOOK_TOKEN_HEADER =
  process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
process.env.WAHA_WEBHOOK_TOKEN_VALUE =
  process.env.WAHA_WEBHOOK_TOKEN_VALUE ?? 'token';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? '1234567890123456';
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? 'turnstile-secret';
process.env.ALTCHA_HMAC_SECRET = process.env.ALTCHA_HMAC_SECRET ?? 'test-altcha-hmac-secret-32-bytes!';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';
// OpenAI-specific
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'sk-test-key';
process.env.OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
process.env.AUTO_OCR_DAILY_LIMIT = process.env.AUTO_OCR_DAILY_LIMIT ?? '100';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/** Build a minimal successful OpenAI chat-completions response body. */
function makeOpenAiResponse(amountValue: number | null): string {
  const content = JSON.stringify({ amount: amountValue });
  return JSON.stringify({
    choices: [{ message: { content } }],
  });
}

/** Build a minimal OpenAI response with arbitrary content string. */
function makeOpenAiResponseRaw(content: string): string {
  return JSON.stringify({
    choices: [{ message: { content } }],
  });
}

type FetchStub = {
  calls: { url: string; init: RequestInit }[];
  responses: Response[];
  restore: () => void;
};

function stubFetch(responses: Response[]): FetchStub {
  const originalFetch = globalThis.fetch;
  const stub: FetchStub = {
    calls: [],
    responses: [...responses],
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };

  let idx = 0;
  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const resolvedUrl = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    stub.calls.push({ url: resolvedUrl, init: init ?? {} });
    const response = stub.responses[idx];
    idx = Math.min(idx + 1, stub.responses.length - 1);
    if (!response) throw new Error('No more stub responses');
    return response;
  };

  return stub;
}

function makeResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('extractAmountFromImage POSTs to https://api.openai.com/v1/chat/completions', async () => {
  const stub = stubFetch([makeResponse(200, makeOpenAiResponse(1000))]);
  try {
    const { extractAmountFromImage } = await import('./client.js');
    const buf = Buffer.from('fake-image-data');
    await extractAmountFromImage(buf, 'image/jpeg');
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].url, OPENAI_URL);
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage sets Authorization header with OPENAI_API_KEY', async () => {
  const stub = stubFetch([makeResponse(200, makeOpenAiResponse(500))]);
  try {
    const { extractAmountFromImage } = await import('./client.js');
    const buf = Buffer.from('data');
    await extractAmountFromImage(buf, 'image/png');
    const headers = stub.calls[0].init.headers as Record<string, string>;
    assert.equal(headers['Authorization'], 'Bearer sk-test-key');
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage sets Content-Type: application/json', async () => {
  const stub = stubFetch([makeResponse(200, makeOpenAiResponse(500))]);
  try {
    const { extractAmountFromImage } = await import('./client.js');
    await extractAmountFromImage(Buffer.from('data'), 'image/jpeg');
    const headers = stub.calls[0].init.headers as Record<string, string>;
    assert.equal(headers['Content-Type'], 'application/json');
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage request body uses OPENAI_MODEL, temperature:0, max_tokens:50, response_format json_object', async () => {
  const stub = stubFetch([makeResponse(200, makeOpenAiResponse(100))]);
  try {
    const { extractAmountFromImage } = await import('./client.js');
    await extractAmountFromImage(Buffer.from('data'), 'image/jpeg');
    const body = JSON.parse(stub.calls[0].init.body as string);
    assert.equal(body.model, 'gpt-4o-mini');
    assert.equal(body.temperature, 0);
    assert.equal(body.max_tokens, 50);
    assert.deepEqual(body.response_format, { type: 'json_object' });
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage user message includes image_url part with correct data URL', async () => {
  const stub = stubFetch([makeResponse(200, makeOpenAiResponse(100))]);
  try {
    const { extractAmountFromImage } = await import('./client.js');
    const buf = Buffer.from('hello-image');
    const mimetype = 'image/png';
    await extractAmountFromImage(buf, mimetype);
    const body = JSON.parse(stub.calls[0].init.body as string);
    const userMsg = body.messages.find((m: { role: string }) => m.role === 'user');
    assert.ok(userMsg, 'user message must exist');
    const imagePart = Array.isArray(userMsg.content)
      ? userMsg.content.find((p: { type: string }) => p.type === 'image_url')
      : null;
    assert.ok(imagePart, 'image_url part must exist in user message content');
    const expected = `data:${mimetype};base64,${buf.toString('base64')}`;
    assert.equal(imagePart.image_url.url, expected);
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage system message instructs strict JSON {"amount": <number>} or {"amount": null}', async () => {
  const stub = stubFetch([makeResponse(200, makeOpenAiResponse(100))]);
  try {
    const { extractAmountFromImage } = await import('./client.js');
    await extractAmountFromImage(Buffer.from('data'), 'image/jpeg');
    const body = JSON.parse(stub.calls[0].init.body as string);
    const systemMsg = body.messages.find((m: { role: string }) => m.role === 'system');
    assert.ok(systemMsg, 'system message must exist');
    const content: string = typeof systemMsg.content === 'string' ? systemMsg.content : '';
    // Must mention JSON and amount
    assert.ok(content.includes('{"amount"'), 'system prompt must include {"amount"} shape');
    assert.ok(content.includes('null'), 'system prompt must mention null');
    // Must not instruct prose
    assert.ok(
      content.toLowerCase().includes('no prose') || content.toLowerCase().includes('only'),
      'system prompt must restrict prose',
    );
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage returns parsed amount on success {"amount": 5000}', async () => {
  const stub = stubFetch([makeResponse(200, makeOpenAiResponse(5000))]);
  try {
    const { extractAmountFromImage } = await import('./client.js');
    const result = await extractAmountFromImage(Buffer.from('data'), 'image/jpeg');
    assert.equal(result, 5000);
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage returns null when response has {"amount": null}', async () => {
  const stub = stubFetch([makeResponse(200, makeOpenAiResponse(null))]);
  try {
    const { extractAmountFromImage } = await import('./client.js');
    const result = await extractAmountFromImage(Buffer.from('data'), 'image/jpeg');
    assert.equal(result, null);
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage returns null for NaN amount', async () => {
  const stub = stubFetch([makeResponse(200, makeOpenAiResponseRaw('{"amount": "NaN"}'))]);
  try {
    const { extractAmountFromImage } = await import('./client.js');
    const result = await extractAmountFromImage(Buffer.from('data'), 'image/jpeg');
    assert.equal(result, null);
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage returns null for negative amount', async () => {
  const stub = stubFetch([makeResponse(200, makeOpenAiResponse(-100))]);
  try {
    const { extractAmountFromImage } = await import('./client.js');
    const result = await extractAmountFromImage(Buffer.from('data'), 'image/jpeg');
    assert.equal(result, null);
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage returns null for zero amount', async () => {
  const stub = stubFetch([makeResponse(200, makeOpenAiResponse(0))]);
  try {
    const { extractAmountFromImage } = await import('./client.js');
    const result = await extractAmountFromImage(Buffer.from('data'), 'image/jpeg');
    assert.equal(result, null);
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage returns null for amount > 10_000_000', async () => {
  const stub = stubFetch([makeResponse(200, makeOpenAiResponse(10_000_001))]);
  try {
    const { extractAmountFromImage } = await import('./client.js');
    const result = await extractAmountFromImage(Buffer.from('data'), 'image/jpeg');
    assert.equal(result, null);
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage returns null for amount exactly 10_000_000 (on cap boundary)', async () => {
  const stub = stubFetch([makeResponse(200, makeOpenAiResponse(10_000_000))]);
  try {
    const { extractAmountFromImage } = await import('./client.js');
    const result = await extractAmountFromImage(Buffer.from('data'), 'image/jpeg');
    // 10_000_000 is the max valid value (design: <= 10_000_000)
    assert.equal(result, 10_000_000);
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage returns null for malformed JSON response', async () => {
  const stub = stubFetch([makeResponse(200, JSON.stringify({ choices: [{ message: { content: 'not json{{{' } }] }))]);
  try {
    const { extractAmountFromImage } = await import('./client.js');
    const result = await extractAmountFromImage(Buffer.from('data'), 'image/jpeg');
    assert.equal(result, null);
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage returns null when amount key is missing from response JSON', async () => {
  const stub = stubFetch([makeResponse(200, JSON.stringify({ choices: [{ message: { content: '{"value": 500}' } }] }))]);
  try {
    const { extractAmountFromImage } = await import('./client.js');
    const result = await extractAmountFromImage(Buffer.from('data'), 'image/jpeg');
    assert.equal(result, null);
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage throws OpenAiUnavailableError on 429 after one retry (fetch called twice)', async () => {
  const stub = stubFetch([
    makeResponse(429, '{"error":"rate limit"}'),
    makeResponse(429, '{"error":"rate limit"}'),
  ]);
  try {
    const { extractAmountFromImage, OpenAiUnavailableError } = await import('./client.js');
    await assert.rejects(
      () => extractAmountFromImage(Buffer.from('data'), 'image/jpeg'),
      (err: unknown) => {
        assert.ok(err instanceof OpenAiUnavailableError, `expected OpenAiUnavailableError, got ${err}`);
        return true;
      },
    );
    assert.equal(stub.calls.length, 2, 'fetch must be called twice (initial + 1 retry)');
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage throws OpenAiUnavailableError on 500 after one retry (fetch called twice)', async () => {
  const stub = stubFetch([
    makeResponse(500, '{"error":"internal"}'),
    makeResponse(500, '{"error":"internal"}'),
  ]);
  try {
    const { extractAmountFromImage, OpenAiUnavailableError } = await import('./client.js');
    await assert.rejects(
      () => extractAmountFromImage(Buffer.from('data'), 'image/jpeg'),
      (err: unknown) => {
        assert.ok(err instanceof OpenAiUnavailableError);
        return true;
      },
    );
    assert.equal(stub.calls.length, 2, 'fetch must be called twice (initial + 1 retry)');
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage succeeds on 429 then 200 (first retry succeeds)', async () => {
  const stub = stubFetch([
    makeResponse(429, '{"error":"rate limit"}'),
    makeResponse(200, makeOpenAiResponse(750)),
  ]);
  try {
    const { extractAmountFromImage } = await import('./client.js');
    const result = await extractAmountFromImage(Buffer.from('data'), 'image/jpeg');
    assert.equal(result, 750);
    assert.equal(stub.calls.length, 2);
  } finally {
    stub.restore();
  }
});

test('extractAmountFromImage throws if OPENAI_API_KEY is missing', async () => {
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const { extractAmountFromImage } = await import('./client.js');
    await assert.rejects(
      () => extractAmountFromImage(Buffer.from('data'), 'image/jpeg'),
      /OPENAI_API_KEY/,
    );
  } finally {
    process.env.OPENAI_API_KEY = original;
  }
});
