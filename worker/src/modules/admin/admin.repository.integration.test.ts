/**
 * Live-DB integration test for the conversion-count lead-id resolver.
 *
 * This exercises the REAL SQL path (`resolveConversionCountLeadIds`, the
 * gte/lte logic that powers listLeadsAdmin's RECARGA / converted-strict filter)
 * against a real Postgres, guarding the BUG #1 regression: when RECARGA is
 * selected together with a plain status, non-CONVERTED leads must NOT be dropped
 * by the recarga INNER JOIN, and the resolved id set must stay correct.
 *
 * It targets the resolver (not full listLeadsAdmin) on purpose: listLeadsAdmin's
 * page fetch uses a `cashier` include that selects `Cashier.maxSessions`, a
 * column that does NOT exist in the drifted local seed DB. The resolver reads
 * only Lead + Conversion columns that DO exist, so it runs cleanly here while
 * still covering all the bug-prone set logic.
 *
 * It runs against the local Postgres reachable from the host shell at
 * postgresql://onlylemon:onlylemon@127.0.0.1:5432/onlylemon. When that DB is not
 * reachable (e.g. the default `npm test` run with no live host), it skips
 * gracefully instead of hanging or failing the suite.
 *
 * SCHEMA-DRIFT CAVEAT: the live `Conversion` table has ONLY (id, leadId, amount,
 * createdAt). The on-disk Prisma schema declares extra columns (source/cashierId/
 * sourceMessageId) that do NOT exist in this DB, so fixtures are inserted via
 * $executeRaw against the 4 real columns — never `prisma.conversion.create`.
 *
 * Fixtures use the `TEST-PG-` code prefix and a unique adCode, and are fully
 * cleaned up in `after`. Existing `SEED-%` rows are never touched.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../../generated/prisma/client.js';

// Env defaults so the module graph (admin.repository.js → config/env.ts) loads.
// The shared prisma singleton's URL is irrelevant here: this test uses its OWN
// client (see below). These just satisfy the env zod schema at import time.
process.env.PORT = process.env.PORT ?? '3002';
process.env.LEADS_CODE_TTL_HOURS = process.env.LEADS_CODE_TTL_HOURS ?? '24';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://onlylemon:onlylemon@127.0.0.1:5432/onlylemon';
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
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

// This test owns its own PrismaClient pointed at an explicit live URL, rather
// than the shared `prisma` singleton (whose connection string is frozen at first
// import and thus depends on suite ordering). That makes the reachable/skip
// decision deterministic regardless of which test file loads the client first.
const LIVE_DATABASE_URL =
  process.env.LIVE_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://onlylemon:onlylemon@127.0.0.1:5432/onlylemon';

const CODE_PREFIX = 'TEST-PG-';
const CODE_CONTACTED = `${CODE_PREFIX}CONTACTED-0`;
const CODE_CONVERTED_ONE = `${CODE_PREFIX}CONVERTED-1`;
const CODE_RECARGA = `${CODE_PREFIX}RECARGA-2`;

// A unique adCode shared by all three fixtures, used as a filter so the resolved
// id set contains ONLY our fixtures (the live DB has 3000 seeded leads), making
// the total/membership assertions exact.
const TEST_AD_CODE = 'test-pg-ad-code-pagination';

describe('resolveConversionCountLeadIds — live DB conversion-count filtering', { timeout: 60_000 }, () => {
  let reachable = false;
  let client: InstanceType<typeof PrismaClient>;
  let resolveConversionCountLeadIds:
    typeof import('./admin.repository.js')['resolveConversionCountLeadIds'];
  let buildListLeadsQuery: typeof import('./admin.repository.js')['buildListLeadsQuery'];

  let contactedLeadId = '';
  let convertedOneLeadId = '';
  let recargaLeadId = '';

  before(async () => {
    ({ resolveConversionCountLeadIds, buildListLeadsQuery } = await import('./admin.repository.js'));

    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: LIVE_DATABASE_URL }) });

    try {
      await client.$queryRawUnsafe('SELECT 1');
      reachable = true;
    } catch {
      reachable = false;
      await client.$disconnect().catch(() => undefined);
      return;
    }

    // Insert 3 leads via raw SQL (only columns that exist in the drifted DB).
    // Required NOT NULL columns without defaults: code, fbc, fbp, userAgent,
    // updateAt, metaPixelId. cashierId is left NULL on purpose.
    const insertLead = (code: string, status: 'CONTACTED' | 'CONVERTED') =>
      client.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO "Lead" ("id","code","fbc","fbp","userAgent","metaPixelId","adCode","status","cashierId","createdAt","updateAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::"LeadStatus", NULL, NOW(), NOW())
         RETURNING id`,
        code,
        `fbc-${code}`,
        `fbp-${code}`,
        'test-agent',
        'test-pixel',
        TEST_AD_CODE,
        status,
      );

    [contactedLeadId] = (await insertLead(CODE_CONTACTED, 'CONTACTED')).map((r) => r.id);
    [convertedOneLeadId] = (await insertLead(CODE_CONVERTED_ONE, 'CONVERTED')).map((r) => r.id);
    [recargaLeadId] = (await insertLead(CODE_RECARGA, 'CONVERTED')).map((r) => r.id);

    const insertConversion = (leadId: string) =>
      client.$executeRawUnsafe(
        `INSERT INTO "Conversion" ("id","leadId","amount","createdAt")
         VALUES (gen_random_uuid(), $1, 1000, NOW())`,
        leadId,
      );

    // CONVERTED-with-1 → exactly 1 conversion; RECARGA → 2 conversions.
    await insertConversion(convertedOneLeadId);
    await insertConversion(recargaLeadId);
    await insertConversion(recargaLeadId);
  });

  after(async () => {
    if (!reachable) return;
    // Clean up ONLY our TEST-PG- fixtures and their conversions.
    await client.$executeRawUnsafe(
      `DELETE FROM "Conversion" WHERE "leadId" IN (SELECT id FROM "Lead" WHERE code LIKE $1)`,
      `${CODE_PREFIX}%`,
    );
    await client.$executeRawUnsafe(`DELETE FROM "Lead" WHERE code LIKE $1`, `${CODE_PREFIX}%`);
    await client.$disconnect();
  });

  // Build the same baseWhere listLeadsAdmin would, scoped to our fixtures via adCode.
  const baseWhere = (statuses: Array<'CONTACTED' | 'CONVERTED'>) =>
    buildListLeadsQuery({ statuses, adCode: TEST_AD_CODE }).where as Prisma.LeadWhereInput;

  it('BUG #1 guard: [CONTACTED, CONVERTED] + gte 2 → CONTACTED + recarga (total=2)', async (t) => {
    if (!reachable) return t.skip('live DB not reachable');
    const idSet = new Set(
      await resolveConversionCountLeadIds(
        baseWhere(['CONTACTED', 'CONVERTED']),
        { kind: 'gte', value: 2 },
        client,
      ),
    );
    assert.ok(idSet.has(contactedLeadId), 'CONTACTED lead must be present');
    assert.ok(idSet.has(recargaLeadId), 'recarga lead must be present');
    assert.ok(!idSet.has(convertedOneLeadId), 'CONVERTED-with-1 must be absent');
    assert.equal(idSet.size, 2);
  });

  it('[CONVERTED] + gte 2 → only the recarga lead (total=1)', async (t) => {
    if (!reachable) return t.skip('live DB not reachable');
    const idSet = new Set(
      await resolveConversionCountLeadIds(baseWhere(['CONVERTED']), { kind: 'gte', value: 2 }, client),
    );
    assert.ok(idSet.has(recargaLeadId), 'recarga lead must be present');
    assert.ok(!idSet.has(contactedLeadId), 'CONTACTED lead must be absent');
    assert.ok(!idSet.has(convertedOneLeadId), 'CONVERTED-with-1 must be absent');
    assert.equal(idSet.size, 1);
  });

  it('[CONVERTED] + lte 1 → only the CONVERTED-with-1 lead (total=1)', async (t) => {
    if (!reachable) return t.skip('live DB not reachable');
    const idSet = new Set(
      await resolveConversionCountLeadIds(baseWhere(['CONVERTED']), { kind: 'lte', value: 1 }, client),
    );
    assert.ok(idSet.has(convertedOneLeadId), 'CONVERTED-with-1 must be present');
    assert.ok(!idSet.has(recargaLeadId), 'recarga lead must be absent');
    assert.ok(!idSet.has(contactedLeadId), 'CONTACTED lead must be absent');
    assert.equal(idSet.size, 1);
  });

  it('[CONTACTED, CONVERTED] + lte 1 → CONTACTED + CONVERTED-with-1 (total=2)', async (t) => {
    if (!reachable) return t.skip('live DB not reachable');
    const idSet = new Set(
      await resolveConversionCountLeadIds(
        baseWhere(['CONTACTED', 'CONVERTED']),
        { kind: 'lte', value: 1 },
        client,
      ),
    );
    assert.ok(idSet.has(contactedLeadId), 'CONTACTED lead must be present');
    assert.ok(idSet.has(convertedOneLeadId), 'CONVERTED-with-1 must be present');
    assert.ok(!idSet.has(recargaLeadId), 'recarga lead must be absent');
    assert.equal(idSet.size, 2);
  });
});
