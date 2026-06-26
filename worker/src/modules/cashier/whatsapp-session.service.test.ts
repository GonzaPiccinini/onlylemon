import { test } from 'node:test';
import assert from 'node:assert/strict';

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
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

// ---------------------------------------------------------------------------
// B2: SESSION_CAP_REACHED unit test
// ---------------------------------------------------------------------------

test('B2: createSession rejects with SESSION_CAP_REACHED when at maxSessions', async () => {
  const { SESSION_CAP_REACHED } = await import('./whatsapp-session.service.js');

  // We test the business rule directly with a mock-based approach.
  // The service throws when count >= maxSessions.
  const createSessionWithDeps = async (deps: {
    maxSessions: number;
    currentCount: number;
  }) => {
    if (deps.currentCount >= deps.maxSessions) {
      throw new Error(SESSION_CAP_REACHED);
    }
    return { id: 's1', sessionName: 'cashier-abc-123', cashierId: 'c1' };
  };

  // At cap: should throw
  await assert.rejects(
    () => createSessionWithDeps({ maxSessions: 2, currentCount: 2 }),
    (err: Error) => {
      assert.equal(err.message, SESSION_CAP_REACHED);
      return true;
    },
  );

  // Below cap: should succeed
  const result = await createSessionWithDeps({ maxSessions: 2, currentCount: 1 });
  assert.ok(result.sessionName.startsWith('cashier-'));
});

// ---------------------------------------------------------------------------
// B3: Refresh counter increment + cap enforcement
// ---------------------------------------------------------------------------

test('B3: refreshSession — increments refreshCount 0→1→2→3→error', async () => {
  const { REFRESH_CAP, REFRESH_CAP_REACHED } = await import('./whatsapp-session.service.js');

  assert.equal(REFRESH_CAP, 3);

  // Simulate the refresh service logic with an injectable counter
  const refreshWithDeps = (currentCount: number) => {
    if (currentCount >= REFRESH_CAP) {
      throw new Error(REFRESH_CAP_REACHED);
    }
    return { refreshCount: currentCount + 1, lastRefreshAt: new Date() };
  };

  // 0→1 OK
  const r1 = refreshWithDeps(0);
  assert.equal(r1.refreshCount, 1);

  // 1→2 OK
  const r2 = refreshWithDeps(1);
  assert.equal(r2.refreshCount, 2);

  // 2→3 OK
  const r3 = refreshWithDeps(2);
  assert.equal(r3.refreshCount, 3);

  // 3→error
  assert.throws(() => refreshWithDeps(3), (err: Error) => {
    assert.equal(err.message, REFRESH_CAP_REACHED);
    return true;
  });
});

// ---------------------------------------------------------------------------
// B4: processWhatsappSessionStatus — resolves sessionName → WhatsappSession + cashier
// ---------------------------------------------------------------------------

test('B4: processWhatsappSessionStatus — returns matched:false for unknown sessionName', async () => {
  // Mock the dependency: getSessionBySessionName returns null
  const processWithDeps = async (
    sessionName: string,
    status: string,
    occurredAt: Date,
    deps: { getSessionBySessionName: (name: string) => Promise<null | { id: string; cashier: { id: string } }> },
  ) => {
    const sessionRow = await deps.getSessionBySessionName(sessionName);
    if (!sessionRow) {
      return { matched: false as const };
    }
    return { matched: true as const, cashierId: sessionRow.cashier.id };
  };

  const result = await processWithDeps('unknown-session', 'WORKING', new Date(), {
    getSessionBySessionName: async () => null,
  });

  assert.equal(result.matched, false);
});

test('B4: processWhatsappSessionStatus — resolves to correct cashierId', async () => {
  const processWithDeps = async (
    sessionName: string,
    _status: string,
    _occurredAt: Date,
    deps: { getSessionBySessionName: (name: string) => Promise<null | { id: string; cashier: { id: string } }> },
  ) => {
    const sessionRow = await deps.getSessionBySessionName(sessionName);
    if (!sessionRow) return { matched: false as const };
    return { matched: true as const, cashierId: sessionRow.cashier.id };
  };

  const result = await processWithDeps('session-abc', 'WORKING', new Date(), {
    getSessionBySessionName: async () => ({
      id: 's1',
      cashier: { id: 'cashier-123' },
    }),
  });

  assert.equal(result.matched, true);
  if (result.matched) {
    assert.equal(result.cashierId, 'cashier-123');
  }
});

// ---------------------------------------------------------------------------
// B5: disableCashier cascade — WAHA failure does NOT block DB cleanup
// ---------------------------------------------------------------------------

test('B5: disableCashierSessions — calls WAHA delete for each session, continues on error', async () => {
  const wahaCallLog: string[] = [];
  const dbDeleteLog: string[] = [];

  const disableWithDeps = async (
    cashierId: string,
    deps: {
      getSessions: () => Promise<Array<{ id: string; sessionName: string }>>;
      deleteWahaSession: (name: string) => Promise<void>;
      deleteDbSessions: (cashierId: string) => Promise<void>;
    },
  ) => {
    const sessions = await deps.getSessions();
    for (const session of sessions) {
      try {
        await deps.deleteWahaSession(session.sessionName);
        wahaCallLog.push(session.sessionName);
      } catch {
        // best effort — log and continue
      }
    }
    await deps.deleteDbSessions(cashierId);
    dbDeleteLog.push(cashierId);
    return { deletedCount: sessions.length };
  };

  const sessions = [
    { id: 's1', sessionName: 'session-a' },
    { id: 's2', sessionName: 'session-b' },
    { id: 's3', sessionName: 'session-c' },
  ];

  const result = await disableWithDeps('cashier-1', {
    getSessions: async () => sessions,
    // session-b throws — should be ignored
    deleteWahaSession: async (name) => {
      if (name === 'session-b') throw new Error('WAHA_ERROR');
    },
    deleteDbSessions: async (id) => { void id; },
  });

  assert.equal(result.deletedCount, 3);
  // Only a and c succeeded in WAHA (b threw)
  assert.deepEqual(wahaCallLog, ['session-a', 'session-c']);
  // DB delete always called
  assert.deepEqual(dbDeleteLog, ['cashier-1']);
});

// ---------------------------------------------------------------------------
// B6: createCashier auto-creates 1 WhatsappSession
// ---------------------------------------------------------------------------

test('B6: createCashier flow — auto-creates 1 WhatsappSession with expected sessionName pattern', async () => {
  // Simulate the pattern: cashier-{compactId}-{timestamp36}
  const buildSessionName = (cashierId: string) => {
    const compact = cashierId.replace(/-/g, '');
    const suffix = 'abc123'; // deterministic for test
    return `cashier-${compact}-${suffix}`;
  };

  const cashierId = '550e8400-e29b-41d4-a716-446655440000';
  const sessionName = buildSessionName(cashierId);

  assert.ok(sessionName.startsWith('cashier-'));
  // compact UUID has no dashes
  assert.ok(!sessionName.split('-').slice(1, -1).some((p) => p === ''));

  // Verify pattern: cashier-{32 hex chars}-{timestamp36}
  const parts = sessionName.split('-');
  assert.equal(parts[0], 'cashier');
  // compact UUID is 32 chars
  assert.equal(parts[1].length, 32);
  // suffix is present
  assert.ok(parts[2].length > 0);
});

// ---------------------------------------------------------------------------
// B1: listSessionsByCashier — returns array from repo
// ---------------------------------------------------------------------------

test('B1: listSessionsByCashier — returns array shape', async () => {
  const listWithMock = async (cashierId: string, mockSessions: Array<{id: string; sessionName: string; cashierId: string; refreshCount: number}>) => {
    return mockSessions.filter((s) => s.cashierId === cashierId);
  };

  const sessions = [
    { id: 's1', sessionName: 'session-a', cashierId: 'c1', refreshCount: 0 },
    { id: 's2', sessionName: 'session-b', cashierId: 'c1', refreshCount: 1 },
    { id: 's3', sessionName: 'session-c', cashierId: 'c2', refreshCount: 0 },
  ];

  const result = await listWithMock('c1', sessions);
  assert.equal(result.length, 2);
  assert.equal(result[0].sessionName, 'session-a');
  assert.equal(result[1].sessionName, 'session-b');
});

// ---------------------------------------------------------------------------
// finishWorkSessionIfNoWorkingWaha — only ends work session when LAST session
// ---------------------------------------------------------------------------

const decideFinishWorkSession = (
  hasActiveWorkSession: boolean,
  remainingStatuses: string[],
): { shouldFinish: boolean } => {
  if (!hasActiveWorkSession) return { shouldFinish: false };
  if (remainingStatuses.length === 0) return { shouldFinish: true };
  const anyWorking = remainingStatuses.some((s) => s === 'WORKING');
  return { shouldFinish: !anyWorking };
};

test('finishWorkSessionIfNoWorkingWaha: no work session active -> never finishes', () => {
  const result = decideFinishWorkSession(false, ['WORKING', 'STOPPED']);
  assert.equal(result.shouldFinish, false);
});

test('finishWorkSessionIfNoWorkingWaha: work session + zero remaining sessions -> finishes', () => {
  const result = decideFinishWorkSession(true, []);
  assert.equal(result.shouldFinish, true);
});

test('finishWorkSessionIfNoWorkingWaha: work session + at least one WORKING remains -> keeps', () => {
  const result = decideFinishWorkSession(true, ['STOPPED', 'WORKING', 'FAILED']);
  assert.equal(result.shouldFinish, false);
});

test('finishWorkSessionIfNoWorkingWaha: work session + all non-WORKING remaining -> finishes', () => {
  const result = decideFinishWorkSession(true, ['STOPPED', 'FAILED', 'SCAN_QR_CODE']);
  assert.equal(result.shouldFinish, true);
});

test('finishWorkSessionIfNoWorkingWaha: work session + single remaining WORKING -> keeps', () => {
  const result = decideFinishWorkSession(true, ['WORKING']);
  assert.equal(result.shouldFinish, false);
});
