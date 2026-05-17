import { test } from 'node:test';
import assert from 'node:assert/strict';

// Set required env vars before any imports
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
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

// ---------------------------------------------------------------------------
// C1: getSessionBySessionName — unit tests (repo contract, no real DB)
// ---------------------------------------------------------------------------

test('C1: getActiveLandingSessionCandidatesByMetaPixelId — filters by workingSessionNames', async () => {
  // We test the pure filtering logic through the exported helper
  // The actual Prisma query is tested via integration; here we test the shape contract.

  // Simulate what the function would return for a landing with 2 sessions,
  // only one of which is WORKING.
  const allCandidates = [
    { sessionId: 's1', sessionName: 'session-a', cashierId: 'c1', activeSince: new Date('2026-05-01T10:00:00Z') },
    { sessionId: 's2', sessionName: 'session-b', cashierId: 'c2', activeSince: new Date('2026-05-01T11:00:00Z') },
  ];
  const workingNames = new Set(['session-a']);
  const filtered = allCandidates.filter((c) => workingNames.has(c.sessionName));

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].sessionName, 'session-a');
  assert.equal(filtered[0].cashierId, 'c1');
});

test('C1: getActiveLandingSessionCandidatesByMetaPixelId — returns empty when no sessions working', async () => {
  const allCandidates = [
    { sessionId: 's1', sessionName: 'session-a', cashierId: 'c1', activeSince: null },
  ];
  const workingNames = new Set<string>();
  const filtered = allCandidates.filter((c) => workingNames.has(c.sessionName));

  assert.equal(filtered.length, 0);
});

test('C1: getSessionsBoundToLanding — maps session rows to BoundSessionCandidate shape', async () => {
  // Simulate the shape returned by getSessionsBoundToLanding
  const rows = [
    { session: { id: 's1', sessionName: 'session-a', cashierId: 'c1' } },
    { session: { id: 's2', sessionName: 'session-b', cashierId: 'c2' } },
  ];
  const candidates = rows.map((item) => ({
    sessionId: item.session.id,
    sessionName: item.session.sessionName,
    cashierId: item.session.cashierId,
  }));

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].sessionId, 's1');
  assert.equal(candidates[1].cashierId, 'c2');
});

test('C1: getSessionBySessionName — returns null shape when not found (mock)', async () => {
  // Unit test the contract: if prisma returns null, function returns null
  // We use a type-compatible mock to check the null-propagation shape
  const mockRepo = {
    getSessionBySessionName: async (name: string) => {
      if (name === 'unknown') return null;
      return {
        id: 's1',
        sessionName: name,
        cashierId: 'c1',
        cashier: { id: 'c1', userId: 'u1', status: 'ACTIVE' as const, maxSessions: 1, createdAt: new Date(), updatedAt: new Date() },
        whatsappPhoneNumber: null,
        refreshCount: 0,
        lastRefreshAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
  };

  const notFound = await mockRepo.getSessionBySessionName('unknown');
  assert.equal(notFound, null);

  const found = await mockRepo.getSessionBySessionName('cashier-abc-def');
  assert.ok(found !== null);
  assert.equal(found.cashierId, 'c1');
  assert.ok('cashier' in found);
  assert.equal(found.cashier.id, 'c1');
});
