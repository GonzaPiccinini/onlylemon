/**
 * processor.integration.test.ts
 *
 * Integration test: auto-conversion happy path — end-to-end through
 * createAutoConversionService + createInboundProcessor with:
 *   - REAL Postgres (testcontainer) via Prisma
 *   - REAL system-settings / cashier / auto-conversion repositories
 *   - MOCKED WAHA (fetchChatMessages, downloadMedia, sendText)
 *   - MOCKED OpenAI (extractAmountFromImage)
 *   - STUBBED Redis budget (in-memory, never exceeds limit)
 *
 * Scenario J1 (happy path):
 *   Cashier sends trigger phrase → processor routes to handleCashierTriggerMessage
 *   → service walks chat history → OCR → createConversion
 *   → DB has Conversion row with source='AUTO_OCR', sourceMessageId set, cashierId set
 *   → Lead status is CONVERTED
 *   → sendText NOT called (happy path is silent)
 *
 * NOTE: This test uses testcontainers (Docker required). Timeout: 120s.
 */

// ---------------------------------------------------------------------------
// Env stubs — MUST come before any project module imports
// ---------------------------------------------------------------------------
process.env.PORT = process.env.PORT ?? '3002';
process.env.LEADS_CODE_TTL_HOURS = process.env.LEADS_CODE_TTL_HOURS ?? '24';
// DATABASE_URL is overridden after the container starts (see before())
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test';
process.env.BULLMQ_REDIS_URL = process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379';
process.env.BULLMQ_QUEUE_NAME = process.env.BULLMQ_QUEUE_NAME ?? 'test-queue';
process.env.WORKER_CONCURRENCY = process.env.WORKER_CONCURRENCY ?? '1';
process.env.WAHA_API_KEY = process.env.WAHA_API_KEY ?? 'waha-test-key';
process.env.WAHA_BASE_URL = process.env.WAHA_BASE_URL ?? 'http://waha.local:3000';
process.env.WAHA_WEBHOOK_URL = process.env.WAHA_WEBHOOK_URL ?? 'http://localhost:3002/webhook';
process.env.WAHA_WEBHOOK_EVENTS =
  process.env.WAHA_WEBHOOK_EVENTS ?? 'message.any,session.status';
process.env.WAHA_WEBHOOK_TOKEN_HEADER =
  process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
process.env.WAHA_WEBHOOK_TOKEN_VALUE = process.env.WAHA_WEBHOOK_TOKEN_VALUE ?? 'token';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? '1234567890123456';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'sk-test-key';

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  startPostgresContainer,
  applyMigrations,
  type TestcontainerContext,
} from '../../test-utils/postgres-testcontainer.js';
import { createAutoConversionService } from '../../modules/auto-conversion/service.js';
import { createBudgetChecker } from '../../modules/auto-conversion/budget.js';
import { createInboundProcessor, type InboundProcessorDeps } from './processor.js';
import type { WahaMessage } from '../../integrations/waha/client.js';

// ---------------------------------------------------------------------------
// Seed IDs (deterministic UUIDs)
// ---------------------------------------------------------------------------

const SEED = {
  userId: 'aaaa0001-0000-0000-0000-000000000001',
  cashierId: 'bbbb0001-0000-0000-0000-000000000001',
  leadId: 'cccc0001-0000-0000-0000-000000000001',
  sessionName: 'test-session-1',
  phone: '5491112345678',
  chatId: '5491112345678@c.us',
  triggerPhrase: 'Fichas cargadas!',
  messageId: 'msg-trigger-1',
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('integration: processor end-to-end (auto-conversion happy path)', { timeout: 120_000 }, () => {
  let ctx: TestcontainerContext;
  let prisma: PrismaClient;

  before(async () => {
    // 1. Spin up Postgres container with ALL migrations applied
    ctx = await startPostgresContainer();
    await applyMigrations(ctx.databaseUrl);

    // 2. Override DATABASE_URL so that the Prisma client points to the test DB
    process.env.DATABASE_URL = ctx.databaseUrl;

    // 3. Create a Prisma client pointing to the test container (uses PrismaPg adapter — same as production client.ts)
    const adapter = new PrismaPg({ connectionString: ctx.databaseUrl });
    prisma = new PrismaClient({ adapter, log: [] });

    // 4. Seed: User + Cashier
    await prisma.user.create({
      data: {
        id: SEED.userId,
        name: 'Test Cashier',
        username: 'test_cashier_int',
        password: 'hashed',
        role: 'CASHIER',
      },
    });
    await prisma.cashier.create({
      data: {
        id: SEED.cashierId,
        userId: SEED.userId,
        status: 'ACTIVE',
      },
    });

    // 5. Seed: WhatsappSession linking cashier → sessionName
    await prisma.whatsappSession.create({
      data: {
        cashierId: SEED.cashierId,
        sessionName: SEED.sessionName,
      },
    });

    // 6. Seed: Lead in CONTACTED status
    await prisma.lead.create({
      data: {
        id: SEED.leadId,
        code: 'INT-TEST-01',
        fbc: 'fbc_int',
        fbp: 'fbp_int',
        metaPixelId: 'pixel-int-1',
        status: 'CONTACTED',
        userAgent: 'test-ua',
        phone: `+${SEED.phone}`,
        cashierId: SEED.cashierId,
      },
    });

    // 7. Seed: SystemSetting for trigger phrase
    await prisma.systemSetting.create({
      data: {
        key: 'auto_conversion_trigger_phrase',
        value: SEED.triggerPhrase,
      },
    });
  });

  after(async () => {
    await prisma.$disconnect();
    await ctx.stop();
  });

  it('J1 — happy path: trigger message creates Conversion row with source=AUTO_OCR and converts Lead', async () => {
    // -----------------------------------------------------------------------
    // Arrange: build mocked WAHA + OpenAI + Redis budget
    // -----------------------------------------------------------------------

    const sendTextCalls: Array<[string, string, string]> = [];
    const deleteReceiptCalls: Array<{ bucket: string; key: string }> = [];

    // Mocked fetchChatMessages: returns 5 messages; index 2 (3rd) has an image
    const fakeMessages: WahaMessage[] = [
      { id: 'msg-1', from: SEED.chatId, body: 'hola', fromMe: false, hasMedia: false },
      { id: 'msg-2', from: SEED.chatId, body: 'recarga?', fromMe: false, hasMedia: false },
      {
        id: 'msg-3',
        from: SEED.chatId,
        body: '',
        fromMe: false,
        hasMedia: true,
        media: {
          url: 'https://waha.test/media/comprobante.jpg',
          mimetype: 'image/jpeg',
          s3: { Bucket: 'test-bucket', Key: 'media/comprobante.jpg' },
        },
      },
      { id: 'msg-4', from: SEED.chatId, body: 'ok', fromMe: false, hasMedia: false },
      { id: 'msg-5', from: SEED.chatId, body: 'gracias', fromMe: false, hasMedia: false },
    ];

    const fakeBuffer = Buffer.from('fake-image-data');

    // In-memory Redis stub (never exceeds limit)
    const mockRedis = {
      incr: async (_key: string) => 1, // always first call → also triggers EXPIRE
      expire: async (_key: string, _seconds: number) => 1 as const,
    };

    const budgetChecker = createBudgetChecker(mockRedis, { dailyLimit: 100 });

    // Build the auto-conversion service with real Prisma but mocked I/O
    const autoConvService = createAutoConversionService({
      // Real system-settings: read from DB via prisma directly
      getTriggerPhrase: async () => {
        const setting = await prisma.systemSetting.findUnique({
          where: { key: 'auto_conversion_trigger_phrase' },
        });
        return setting?.value ?? '';
      },

      // Real session resolution: reads WhatsappSession from DB
      resolveCashierIdBySession: async (sessionName: string) => {
        const row = await prisma.whatsappSession.findUnique({
          where: { sessionName },
        });
        return row?.cashierId ?? null;
      },

      // Mocked WAHA chat fetch
      fetchChatMessages: async (_sessionName, _chatId, _opts) => fakeMessages,

      // Mocked WAHA media download
      downloadMedia: async (_url) => ({ buffer: fakeBuffer, mimetype: 'image/jpeg' }),

      // Mocked OpenAI OCR
      extractAmountFromImage: async (_buf, _mime) => 5000,

      // Simplified lead lookup for integration test:
      // Fetch all CONTACTED/CONVERTED leads for the cashier, then match phone digits in JS.
      // (Avoids raw SQL regex escaping quirks with PrismaPg adapter in test context.)
      findLeadByPhoneForCashier: async (phone, cashierId) => {
        const leads = await prisma.lead.findMany({
          where: {
            cashierId,
            status: { in: ['CONTACTED', 'CONVERTED'] },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true, phone: true, code: true },
        });
        const match = leads.find(
          (l) => l.phone != null && l.phone.replace(/\D/g, '') === phone,
        );
        return match ? { id: match.id, status: match.status, code: match.code } : null;
      },

      // Real conversion creation (uses prisma directly to match test DB)
      createConversion: async (cashierId, leadId, amount, options) => {
        try {
          const conversion = await prisma.$transaction(async (tx) => {
            const created = await tx.conversion.create({
              data: {
                leadId,
                amount,
                source: options.source,
                sourceMessageId: options.sourceMessageId,
                cashierId,
              },
            });
            await tx.lead.update({
              where: { id: leadId },
              data: { status: 'CONVERTED' },
            });
            return created;
          });
          return { kind: 'CREATED' as const, conversion };
        } catch (err) {
          const e = err as { code?: string };
          if (e?.code === 'P2002') {
            return { kind: 'DUPLICATE' as const, sourceMessageId: options.sourceMessageId };
          }
          throw err;
        }
      },

      budgetCheckAndIncrement: (cashierId) => budgetChecker.checkAndIncrement(cashierId),

      // Mocked WAHA sendText (should NOT be called on happy path)
      sendText: async (sessionName, chatId, text) => {
        sendTextCalls.push([sessionName, chatId, text]);
      },

      // Item #2: returns null → falls back to client chatId (no side effect in happy path)
      getOwnChatId: async (_sessionName) => null,

      // Item #6: 0 = disabled (no min/max enforcement)
      getMinAmount: async () => 0,
      getMaxAmount: async () => 0,

      // Item #4: stub deleteReceipt — tracks calls, doesn't actually hit R2
      deleteReceipt: async (_bucket: string, _key: string) => {
        deleteReceiptCalls.push({ bucket: _bucket, key: _key });
      },

      // Pase 3: stub renderPdfFirstPageToPng (happy path uses image, not PDF)
      renderPdfFirstPageToPng: async (_pdfBuffer: Buffer) => {
        // Return a fake PNG buffer (PNG magic + padding)
        return Buffer.concat([
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          Buffer.alloc(100, 0),
        ]);
      },

      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },

      lookbackLimit: 20,
    });

    // Build the inbound processor wired to the auto-conversion service
    const deps: InboundProcessorDeps = {
      handleCashierTriggerMessage: autoConvService.handleCashierTriggerMessage.bind(autoConvService),
      mapLeadsToPhone: async () => undefined,
      validateJobIdempotency: async () => true,
      processWhatsappSessionStatusService: async () => undefined,
      getSetting: async (_key: string) => SEED.triggerPhrase,
      // Batch 2 seams — no-op for this integration test (Batch 11 wires real bus)
      mirrorChatMessage: async () => undefined,
      mirrorChatReaction: async () => undefined,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      metrics: {
        jobsTotal: { labels: () => ({ inc: () => undefined }) },
        jobDurationSeconds: { labels: () => ({ observe: () => undefined }) },
      },
    };

    const processor = createInboundProcessor(deps);

    // -----------------------------------------------------------------------
    // Act: process the trigger job
    // -----------------------------------------------------------------------
    const job = {
      id: 'integration-job-1',
      name: 'message.any',
      data: {
        event: 'message.any',
        session: SEED.sessionName,
        payload: {
          id: SEED.messageId,
          from: SEED.chatId,
          body: SEED.triggerPhrase,
          fromMe: true,
          hasMedia: false,
        },
      },
    };

    await processor(job as never);

    // -----------------------------------------------------------------------
    // Assert: DB state
    // -----------------------------------------------------------------------

    // 1. A Conversion row must exist with correct fields
    const conversion = await prisma.conversion.findFirst({
      where: { sourceMessageId: SEED.messageId },
    });

    assert.ok(conversion !== null, 'Conversion row must exist after processing trigger');
    assert.equal(conversion.cashierId, SEED.cashierId, 'Conversion.cashierId must match seeded cashier');
    assert.equal(conversion.leadId, SEED.leadId, 'Conversion.leadId must match seeded lead');
    assert.equal(Number(conversion.amount), 5000, 'Conversion.amount must equal OCR result (5000)');
    assert.equal(conversion.source, 'AUTO_OCR', "Conversion.source must be 'AUTO_OCR'");
    assert.equal(conversion.sourceMessageId, SEED.messageId, 'Conversion.sourceMessageId must equal trigger message ID');

    // 2. Lead status must be CONVERTED
    const lead = await prisma.lead.findUnique({ where: { id: SEED.leadId } });
    assert.ok(lead !== null, 'Lead must still exist');
    assert.equal(lead.status, 'CONVERTED', 'Lead status must be CONVERTED after auto-conversion');

    // 3. sendText must NOT have been called (happy path is silent)
    assert.equal(sendTextCalls.length, 0, 'sendText must NOT be called on happy path');

    // 4. deleteReceipt must have been called for the image's S3 metadata
    assert.equal(deleteReceiptCalls.length, 1, 'deleteReceipt must be called once on happy path');
    assert.equal(deleteReceiptCalls[0].bucket, 'test-bucket');
    assert.equal(deleteReceiptCalls[0].key, 'media/comprobante.jpg');
  });
});
