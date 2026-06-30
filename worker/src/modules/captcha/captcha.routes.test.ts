/**
 * captcha.routes.test.ts
 *
 * Integration-style tests for the public Altcha challenge endpoint.
 *
 * Validates:
 * - GET /altcha/challenge → 200 with a signed proof-of-work challenge whose
 *   shape includes algorithm / challenge / salt / signature / maxnumber.
 * - The HMAC secret (ALTCHA_HMAC_SECRET) is NEVER serialized into the response.
 *
 * The router is mounted on a throwaway Express app and exercised over real HTTP
 * (node:http), mirroring the established `*.routes.test.ts` pattern.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Env bootstrap — must come BEFORE any import that reads config (env.ts validates eagerly)
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

import express from 'express';

/** Minimal fetch-like helper using node:http for test requests */
async function request(
  app: express.Express,
  method: string,
  path: string,
): Promise<{ status: number; body: unknown }> {
  const http = await import('node:http');

  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const address = server.address() as { port: number };
      const clientReq = http.request(
        { hostname: '127.0.0.1', port: address.port, path, method },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            server.close();
            let parsed: unknown = data;
            try {
              parsed = JSON.parse(data);
            } catch {
              /* leave as string */
            }
            resolve({ status: res.statusCode ?? 0, body: parsed });
          });
        },
      );
      clientReq.on('error', (err) => {
        server.close();
        reject(err);
      });
      clientReq.end();
    });
  });
}

async function makeApp(): Promise<express.Express> {
  const { captchaRouter } = await import('./captcha.routes.js');
  const app = express();
  app.use('/altcha', captchaRouter);
  return app;
}

test('GET /altcha/challenge → 200 with a signed proof-of-work challenge shape', async () => {
  const app = await makeApp();

  const { status, body } = await request(app, 'GET', '/altcha/challenge');

  assert.equal(status, 200);
  const challenge = body as Record<string, unknown>;
  assert.equal(typeof challenge.algorithm, 'string', 'algorithm present');
  assert.equal(typeof challenge.challenge, 'string', 'challenge present');
  assert.equal(typeof challenge.salt, 'string', 'salt present');
  assert.equal(typeof challenge.signature, 'string', 'signature present');
  assert.equal(typeof challenge.maxnumber, 'number', 'maxnumber present');
  // createAltchaChallenge lowers maxnumber so the client pre-solve completes <1s
  assert.equal(challenge.maxnumber, 50_000, 'maxnumber matches the configured ceiling');
});

test('GET /altcha/challenge never serializes ALTCHA_HMAC_SECRET into the response', async () => {
  const app = await makeApp();
  const { config } = await import('../../config/env.js');

  const { status, body } = await request(app, 'GET', '/altcha/challenge');

  assert.equal(status, 200);
  assert.ok(config.ALTCHA_HMAC_SECRET.length > 0, 'sanity: a secret is configured');

  const serialized = JSON.stringify(body);
  assert.equal(
    serialized.includes(config.ALTCHA_HMAC_SECRET),
    false,
    'the HMAC secret must never leak into the challenge response',
  );
});
