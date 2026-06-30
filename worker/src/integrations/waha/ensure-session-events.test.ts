import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Env stubs — must appear before any module imports that call config
// ---------------------------------------------------------------------------
process.env.PORT = process.env.PORT ?? '3002';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.BULLMQ_REDIS_URL = process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379';
process.env.BULLMQ_QUEUE_NAME = process.env.BULLMQ_QUEUE_NAME ?? 'test-queue';
process.env.WORKER_CONCURRENCY = process.env.WORKER_CONCURRENCY ?? '1';
process.env.WAHA_API_KEY = process.env.WAHA_API_KEY ?? 'waha-test-key';
process.env.WAHA_BASE_URL = process.env.WAHA_BASE_URL ?? 'http://waha.local:3000';
process.env.WAHA_WEBHOOK_URL = process.env.WAHA_WEBHOOK_URL ?? 'http://localhost:3002/webhook';
process.env.WAHA_WEBHOOK_EVENTS = process.env.WAHA_WEBHOOK_EVENTS ?? 'message.any,session.status';
process.env.WAHA_WEBHOOK_TOKEN_HEADER =
  process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
process.env.WAHA_WEBHOOK_TOKEN_VALUE = process.env.WAHA_WEBHOOK_TOKEN_VALUE ?? 'token';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? '1234567890123456';
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? 'turnstile-secret';
process.env.ALTCHA_HMAC_SECRET = process.env.ALTCHA_HMAC_SECRET ?? 'test-altcha-hmac-secret-32-bytes!';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';
process.env.LEADS_CODE_TTL_HOURS = process.env.LEADS_CODE_TTL_HOURS ?? '24';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import type { SessionsList } from './client.js';

type Deps = {
  getSessions: () => Promise<SessionsList>;
  updateSessionConfig: (sessionName: string, config: object) => Promise<void>;
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
};

/** Build a minimal SessionsList entry for tests. */
function makeSession(
  name: string,
  webhookEvents: string[],
): SessionsList[number] {
  return {
    name,
    status: 'WORKING',
    config: {
      proxy: null,
      debug: false,
      webhooks: webhookEvents.length > 0 || true
        ? [
            {
              url: 'http://example.com/webhook',
              events: webhookEvents,
              hmac: null,
              retries: null,
              customHeaders: null,
            },
          ]
        : [],
    },
    me: { id: '5491112345678@c.us', pushname: 'Test' },
    engine: { engine: 'GOWS' },
  };
}

/** Build a session that has NO webhooks at all. */
function makeSessionNoWebhooks(name: string): SessionsList[number] {
  return {
    name,
    status: 'WORKING',
    config: {
      proxy: null,
      debug: false,
      webhooks: [],
    },
    me: null,
    engine: { engine: 'GOWS' },
  };
}

function makeNoopLogger(): Deps['logger'] {
  return { info: () => {}, warn: () => {} };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ensureSessionsSubscribedToReactions', () => {
  test('session already containing message.reaction is NOT updated (updated count 0)', async () => {
    const { ensureSessionsSubscribedToReactions } = await import('./ensure-session-events.js');

    const updateCalls: string[] = [];
    const deps: Deps = {
      getSessions: async () => [
        makeSession('session-already', ['message.any', 'message.reaction', 'session.status']),
      ],
      updateSessionConfig: async (sessionName) => {
        updateCalls.push(sessionName);
      },
      logger: makeNoopLogger(),
    };

    const result = await ensureSessionsSubscribedToReactions(deps);

    assert.equal(result.checked, 1);
    assert.equal(result.updated, 0);
    assert.equal(result.failed, 0);
    assert.equal(updateCalls.length, 0);
  });

  test('session missing message.reaction → updateSessionConfig called once with config that includes it', async () => {
    const { ensureSessionsSubscribedToReactions } = await import('./ensure-session-events.js');

    const updateCalls: Array<{ sessionName: string; config: object }> = [];
    const deps: Deps = {
      getSessions: async () => [
        makeSession('session-missing', ['message.any', 'session.status']),
      ],
      updateSessionConfig: async (sessionName, config) => {
        updateCalls.push({ sessionName, config });
      },
      logger: makeNoopLogger(),
    };

    const result = await ensureSessionsSubscribedToReactions(deps);

    assert.equal(result.checked, 1);
    assert.equal(result.updated, 1);
    assert.equal(result.failed, 0);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].sessionName, 'session-missing');

    // The updated config's first webhook must include message.reaction
    const cfg = updateCalls[0].config as { webhooks: { events: string[] }[] };
    assert.ok(
      cfg.webhooks[0].events.includes('message.reaction'),
      `updated config webhooks[0].events should include message.reaction, got: ${JSON.stringify(cfg.webhooks[0].events)}`,
    );
    // Must preserve existing events too
    assert.ok(cfg.webhooks[0].events.includes('message.any'));
    assert.ok(cfg.webhooks[0].events.includes('session.status'));
  });

  test('multiple sessions, mixed → only the missing ones are updated; counts correct', async () => {
    const { ensureSessionsSubscribedToReactions } = await import('./ensure-session-events.js');

    const updateCalls: string[] = [];
    const deps: Deps = {
      getSessions: async () => [
        makeSession('session-has', ['message.any', 'message.reaction']),
        makeSession('session-lacks', ['message.any']),
        makeSession('session-also-has', ['message.reaction', 'session.status']),
        makeSession('session-also-lacks', ['session.status']),
      ],
      updateSessionConfig: async (sessionName) => {
        updateCalls.push(sessionName);
      },
      logger: makeNoopLogger(),
    };

    const result = await ensureSessionsSubscribedToReactions(deps);

    assert.equal(result.checked, 4);
    assert.equal(result.updated, 2);
    assert.equal(result.failed, 0);
    assert.ok(updateCalls.includes('session-lacks'));
    assert.ok(updateCalls.includes('session-also-lacks'));
    assert.ok(!updateCalls.includes('session-has'));
    assert.ok(!updateCalls.includes('session-also-has'));
  });

  test('a session whose updateSessionConfig throws → counted as failed, loop continues, function resolves', async () => {
    const { ensureSessionsSubscribedToReactions } = await import('./ensure-session-events.js');

    const processedSessions: string[] = [];
    const deps: Deps = {
      getSessions: async () => [
        makeSession('session-fails', ['message.any']),
        makeSession('session-succeeds', ['message.any']),
      ],
      updateSessionConfig: async (sessionName) => {
        if (sessionName === 'session-fails') {
          throw new Error('WAHA 500');
        }
        processedSessions.push(sessionName);
      },
      logger: makeNoopLogger(),
    };

    // Must not throw
    const result = await ensureSessionsSubscribedToReactions(deps);

    assert.equal(result.checked, 2);
    assert.equal(result.updated, 1);
    assert.equal(result.failed, 1);
    assert.ok(processedSessions.includes('session-succeeds'));
  });

  test('getSessions itself throws (WAHA down) → function resolves with zero counts, does not throw', async () => {
    const { ensureSessionsSubscribedToReactions } = await import('./ensure-session-events.js');

    let warnCalled = false;
    const deps: Deps = {
      getSessions: async () => {
        throw new Error('ECONNREFUSED');
      },
      updateSessionConfig: async () => {},
      logger: {
        info: () => {},
        warn: (..._args: unknown[]) => {
          warnCalled = true;
        },
      },
    };

    // Must not throw
    const result = await ensureSessionsSubscribedToReactions(deps);

    assert.equal(result.checked, 0);
    assert.equal(result.updated, 0);
    assert.equal(result.failed, 0);
    assert.ok(warnCalled, 'logger.warn should have been called when getSessions throws');
  });

  test('idempotency: running twice in a row — second run updates 0', async () => {
    const { ensureSessionsSubscribedToReactions } = await import('./ensure-session-events.js');

    // Simulate: session starts without reaction event.
    // After first run, we track what was "applied" and for second run,
    // the caller provides the already-updated session state.
    let appliedEvents = ['message.any', 'session.status'];

    let callCount = 0;
    const deps: Deps = {
      getSessions: async () => [
        makeSession('session-idempotent', appliedEvents),
      ],
      updateSessionConfig: async (_sessionName, config) => {
        callCount++;
        // Simulate: apply the update (so next getSessions call returns the new state)
        const cfg = config as { webhooks: { events: string[] }[] };
        appliedEvents = cfg.webhooks[0].events;
      },
      logger: makeNoopLogger(),
    };

    const first = await ensureSessionsSubscribedToReactions(deps);
    assert.equal(first.updated, 1, 'first run should update 1 session');

    const second = await ensureSessionsSubscribedToReactions(deps);
    assert.equal(second.updated, 0, 'second run should update 0 sessions (idempotent)');
    assert.equal(callCount, 1, 'updateSessionConfig should only be called once total');
  });

  test('session with no webhooks array entries → not updated (nothing to patch), counted but not failed', async () => {
    const { ensureSessionsSubscribedToReactions } = await import('./ensure-session-events.js');

    const updateCalls: string[] = [];
    const deps: Deps = {
      getSessions: async () => [makeSessionNoWebhooks('session-no-webhooks')],
      updateSessionConfig: async (name) => {
        updateCalls.push(name);
      },
      logger: makeNoopLogger(),
    };

    const result = await ensureSessionsSubscribedToReactions(deps);

    // Session has no webhooks — nothing to patch. Should be checked but not updated or failed.
    assert.equal(result.checked, 1);
    assert.equal(result.failed, 0);
    assert.equal(updateCalls.length, 0);
  });
});
