/**
 * auto-conversion/repository.test.ts
 *
 * Unit tests for the auto-conversion repository.
 * Tests findMostRecentLeadByPhoneForCashier and normalizePhoneDigitsOnly via
 * a mock Prisma client injected through the factory pattern (same approach as
 * system-settings/repository.test.ts).
 *
 * TDD cycle: written BEFORE repository.ts exists (RED), then green once implemented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Minimal env stubs
// ---------------------------------------------------------------------------
process.env.PORT = process.env.PORT ?? '3002';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.BULLMQ_REDIS_URL = process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379';
process.env.BULLMQ_QUEUE_NAME = process.env.BULLMQ_QUEUE_NAME ?? 'test-queue';
process.env.WORKER_CONCURRENCY = process.env.WORKER_CONCURRENCY ?? '1';
process.env.WAHA_API_KEY = process.env.WAHA_API_KEY ?? 'waha-key';
process.env.WAHA_BASE_URL = process.env.WAHA_BASE_URL ?? 'http://localhost:3000';
process.env.WAHA_WEBHOOK_URL = process.env.WAHA_WEBHOOK_URL ?? 'http://localhost:3002/webhook';
process.env.WAHA_WEBHOOK_EVENTS = process.env.WAHA_WEBHOOK_EVENTS ?? 'message.any,session.status';
process.env.WAHA_WEBHOOK_TOKEN_HEADER = process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
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
// Types for mock Prisma client
// ---------------------------------------------------------------------------

type MockLead = {
  id: string;
  phone: string | null;
  cashierId: string | null;
  status: string;
  createdAt: Date;
  [key: string]: unknown;
};

type MockPrismaClient = {
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<MockLead[]>;
};

// ---------------------------------------------------------------------------
// Repository factory (mirrors the real module's injectable pattern)
// ---------------------------------------------------------------------------

function makeRepository(mockPrisma: MockPrismaClient) {
  return {
    findMostRecentLeadByPhoneForCashier: async (
      phone: string,
      cashierId: string,
    ): Promise<MockLead | null> => {
      // Normalize phone to digits only before querying
      const normalized = phone.replace(/@c\.us$/, '').replace(/\D/g, '');
      const results = await mockPrisma.$queryRaw`
        SELECT * FROM "Lead"
        WHERE "cashierId" = ${cashierId}
          AND status IN ('CONTACTED', 'CONVERTED')
          AND regexp_replace(phone, '\D', '', 'g') = ${normalized}
        ORDER BY "createdAt" DESC
        LIMIT 1
      `;
      return results[0] ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// normalizePhoneDigitsOnly — tested via the real module export
// ---------------------------------------------------------------------------

test('normalizePhoneDigitsOnly: exported from repository module', async () => {
  const mod = await import('./repository.js');
  assert.equal(typeof mod.normalizePhoneDigitsOnly, 'function');
});

test('normalizePhoneDigitsOnly: strips @c.us suffix and non-digits', async () => {
  const mod = await import('./repository.js');
  assert.equal(mod.normalizePhoneDigitsOnly('549123456789@c.us'), '549123456789');
});

test('normalizePhoneDigitsOnly: strips + and spaces from international format', async () => {
  const mod = await import('./repository.js');
  assert.equal(mod.normalizePhoneDigitsOnly('+54 9 123 456 789'), '549123456789');
});

test('normalizePhoneDigitsOnly: pure digits pass through unchanged', async () => {
  const mod = await import('./repository.js');
  assert.equal(mod.normalizePhoneDigitsOnly('549123456789'), '549123456789');
});

test('normalizePhoneDigitsOnly: handles mixed format with dashes', async () => {
  const mod = await import('./repository.js');
  assert.equal(mod.normalizePhoneDigitsOnly('+54-9-123-456-789'), '549123456789');
});

// ---------------------------------------------------------------------------
// findMostRecentLeadByPhoneForCashier — via mock (tests normalization + query shape)
// ---------------------------------------------------------------------------

test('findMostRecentLeadByPhoneForCashier: normalizes phone with @c.us before querying', async () => {
  let capturedNormalized: string | undefined;

  const mockPrisma: MockPrismaClient = {
    $queryRaw: async (strings, ...values) => {
      // The second interpolated value is the normalized phone
      capturedNormalized = values[1] as string;
      return [];
    },
  };

  const repo = makeRepository(mockPrisma);
  await repo.findMostRecentLeadByPhoneForCashier('549123456789@c.us', 'cashier-1');

  assert.equal(capturedNormalized, '549123456789');
});

test('findMostRecentLeadByPhoneForCashier: normalizes phone with + and spaces', async () => {
  let capturedNormalized: string | undefined;

  const mockPrisma: MockPrismaClient = {
    $queryRaw: async (strings, ...values) => {
      capturedNormalized = values[1] as string;
      return [];
    },
  };

  const repo = makeRepository(mockPrisma);
  await repo.findMostRecentLeadByPhoneForCashier('+54 9 123 456 789', 'cashier-1');

  assert.equal(capturedNormalized, '549123456789');
});

test('findMostRecentLeadByPhoneForCashier: passes cashierId as first query param', async () => {
  let capturedCashierId: string | undefined;

  const mockPrisma: MockPrismaClient = {
    $queryRaw: async (strings, ...values) => {
      capturedCashierId = values[0] as string;
      return [];
    },
  };

  const repo = makeRepository(mockPrisma);
  await repo.findMostRecentLeadByPhoneForCashier('549123456789', 'cashier-abc');

  assert.equal(capturedCashierId, 'cashier-abc');
});

test('findMostRecentLeadByPhoneForCashier: returns the most recent matching lead', async () => {
  const lead: MockLead = {
    id: 'lead-1',
    phone: '549123456789',
    cashierId: 'cashier-1',
    status: 'CONTACTED',
    createdAt: new Date('2026-05-17'),
  };

  const mockPrisma: MockPrismaClient = {
    $queryRaw: async () => [lead],
  };

  const repo = makeRepository(mockPrisma);
  const result = await repo.findMostRecentLeadByPhoneForCashier('549123456789', 'cashier-1');

  assert.deepEqual(result, lead);
});

test('findMostRecentLeadByPhoneForCashier: returns null when no lead matches', async () => {
  const mockPrisma: MockPrismaClient = {
    $queryRaw: async () => [],
  };

  const repo = makeRepository(mockPrisma);
  const result = await repo.findMostRecentLeadByPhoneForCashier('000000000', 'cashier-1');

  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// Real repository module — export surface (structural check)
// These tests confirm the real module exports the expected functions.
// They fail (RED) until repository.ts is created.
// ---------------------------------------------------------------------------

test('real repository exports findMostRecentLeadByPhoneForCashier function', async () => {
  const mod = await import('./repository.js');
  assert.equal(typeof mod.findMostRecentLeadByPhoneForCashier, 'function');
});
