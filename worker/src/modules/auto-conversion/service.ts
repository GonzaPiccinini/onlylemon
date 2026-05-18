/**
 * auto-conversion/service.ts
 *
 * Orchestrator for the auto-conversion flow triggered by a cashier WhatsApp message.
 *
 * Two exports:
 * 1. `createAutoConversionService(deps)` — factory for testing with injected deps.
 * 2. `handleCashierTriggerMessage(payload)` — module-level default wiring that
 *    assembles real collaborators (used by the processor in Batch 8).
 *
 * Flow (steps from design §1):
 *   1. Check trigger phrase match (case-insensitive after trim).
 *   2. Check fromMe === true.
 *   3. Resolve cashierId from sessionName.
 *   4. Budget check (Redis INCR).
 *   5. Fetch last N chat messages; walk backward for first image/PDF.
 *   6. Download image media.
 *   7. OCR extract amount.
 *   8. Resolve lead by phone (normalized to digits-only).
 *   9. Create conversion with source='AUTO_OCR' and sourceMessageId.
 *
 * Error handling:
 * - `AutoConversionError` family + `OpenAiUnavailableError` → sendText reply, log warn, do NOT rethrow.
 * - Unknown errors → sendText UnexpectedError reply, log ERROR with stack, do NOT rethrow.
 * - DUPLICATE result → silent log only, no sendText.
 */

import {
  AutoConversionError,
  AmountBelowMinError,
  AmountAboveMaxError,
  BudgetExceededError,
  MediaDownloadError,
  NoImageFoundError,
  OcrUnreadableError,
  LeadNotFoundError,
} from './errors.js';
import { buildErrorReply } from './error-message-builder.js';
import { OpenAiUnavailableError } from '../../integrations/openai/client.js';
import type { WahaMessage } from '../../integrations/waha/client.js';

// ---------------------------------------------------------------------------
// Phone normalization (inline to avoid transitive prisma/env import at module level)
// ---------------------------------------------------------------------------

/**
 * Normalizes a phone from a WAHA chatId to digits only.
 * Strips @c.us suffix and all non-digit characters.
 * Mirrors `normalizePhoneDigitsOnly` in repository.ts — kept inline here to
 * avoid pulling prisma/client.ts (and env.ts) into the module at load time,
 * which would break test isolation.
 */
function normalizePhone(chatId: string): string {
  return chatId.replace(/@c\.us$/, '').replace(/\D/g, '');
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TriggerPayload = {
  sessionName: string;
  /** WAHA chat ID, e.g. '5491112345678@c.us' */
  chatId: string;
  /** The WAHA message ID of the trigger message itself */
  messageId: string;
  /** The message body text */
  body: string;
  /** Whether the message was sent by the cashier (fromMe=true) */
  fromMe: boolean;
};

export type AutoConversionDeps = {
  /** Reads the global trigger phrase from system settings; returns '' when unset */
  getTriggerPhrase: () => Promise<string>;
  /** Resolves cashierId from a WAHA session name; returns null if not mapped */
  resolveCashierIdBySession: (sessionName: string) => Promise<string | null>;
  /** Fetches recent messages for a chat */
  fetchChatMessages: (
    sessionName: string,
    chatId: string,
    opts: { limit: number },
  ) => Promise<WahaMessage[]>;
  /** Downloads media bytes from a WAHA-served URL */
  downloadMedia: (url: string) => Promise<{ buffer: Buffer; mimetype: string }>;
  /** Extracts ARS amount from an image buffer; returns null when unreadable */
  extractAmountFromImage: (buf: Buffer, mimetype: string) => Promise<number | null>;
  /** Finds the most recent lead for a (phone, cashierId) pair; returns null if not found */
  findLeadByPhoneForCashier: (
    phone: string,
    cashierId: string,
  ) => Promise<{ id: string; status: string; code: string } | null>;
  /** Creates a conversion; returns {kind:'CREATED'} or {kind:'DUPLICATE'} */
  createConversion: (
    cashierId: string,
    leadId: string,
    amount: number,
    options: { source: 'AUTO_OCR'; sourceMessageId: string },
  ) => Promise<
    | { kind: 'CREATED'; conversion: unknown }
    | { kind: 'DUPLICATE'; sourceMessageId: string | null }
  >;
  /** Increments the OCR budget counter; throws BudgetExceededError when over cap */
  budgetCheckAndIncrement: (cashierId: string) => Promise<void>;
  /** Sends a WhatsApp text reply */
  sendText: (sessionName: string, chatId: string, text: string) => Promise<void>;
  /** Returns the cashier's own WhatsApp JID (me.id) for the session; null if unknown */
  getOwnChatId: (sessionName: string) => Promise<string | null>;
  /** Returns minimum allowed ARS amount; 0 = disabled */
  getMinAmount: () => Promise<number>;
  /** Returns maximum allowed ARS amount; 0 = disabled */
  getMaxAmount: () => Promise<number>;
  /** Deletes a stored receipt from object storage; throws on failure (caller catches) */
  deleteReceipt: (bucket: string, key: string) => Promise<void>;
  /** Renders page 1 of a PDF buffer to a PNG buffer for OCR */
  renderPdfFirstPageToPng: (pdfBuffer: Buffer) => Promise<Buffer>;
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  /** Number of messages to look back for an image (default: 20) */
  lookbackLimit?: number;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAutoConversionService(deps: AutoConversionDeps): {
  handleCashierTriggerMessage: (payload: TriggerPayload) => Promise<void>;
} {
  const {
    getTriggerPhrase,
    resolveCashierIdBySession,
    fetchChatMessages,
    downloadMedia,
    extractAmountFromImage,
    findLeadByPhoneForCashier,
    createConversion,
    budgetCheckAndIncrement,
    sendText,
    getOwnChatId,
    getMinAmount,
    getMaxAmount,
    deleteReceipt,
    renderPdfFirstPageToPng,
    logger,
    lookbackLimit = 20,
  } = deps;

  async function handleCashierTriggerMessage(payload: TriggerPayload): Promise<void> {
    const { sessionName, chatId, messageId, body, fromMe } = payload;

    // Step 1: fromMe guard — only process cashier-sent messages
    if (!fromMe) {
      return;
    }

    // Step 2: Trigger phrase match — case-insensitive, after trim
    const triggerPhrase = await getTriggerPhrase();
    if (!triggerPhrase) {
      // Feature disabled
      return;
    }

    const bodyNormalized = body.trim().toLowerCase();
    const phraseNormalized = triggerPhrase.trim().toLowerCase();

    if (bodyNormalized !== phraseNormalized) {
      return;
    }

    // Step 3: Resolve cashierId from sessionName
    const cashierId = await resolveCashierIdBySession(sessionName);
    if (!cashierId) {
      // Session not linked to any cashier — silent (no one to reply to)
      logger.warn({ event: 'auto_conversion_session_not_mapped', sessionName });
      return;
    }

    // Resolve own chatId at start — used for error replies (Item #2)
    const ownChatId = await getOwnChatId(sessionName);
    if (ownChatId === null) {
      logger.warn({ event: 'auto_conversion_own_chat_id_unavailable', sessionName });
    }
    // The target chat for error replies: own chat if available, fallback to client chat
    const errorReplyChatId = ownChatId ?? chatId;

    // Track context for the rich error reply (Item #2). Populated as the flow
    // progresses so the catch block can include whatever was already resolved.
    let resolvedAmount: number | null = null;
    let resolvedLeadCode: string | null = null;

    // S3 refs of media WAHA re-uploaded while we walked back past them but
    // didn't end up selecting (cashier-sent media, non-image/pdf types, or
    // the candidate when conversion failed). Cleaned up in the finally block
    // regardless of flow outcome so the bucket doesn't accumulate orphans.
    const passedOverRefs: { Bucket: string; Key: string }[] = [];

    try {
      // Step 4: Budget check (throws BudgetExceededError if over cap)
      await budgetCheckAndIncrement(cashierId);

      // Step 5: Walk back incrementally to find the first eligible receipt.
      //
      // We expand the page size one message at a time (limit=1, 2, 3, …) and
      // inspect only the newly-visible (oldest in page) message on each pass.
      // WAHA re-ensures S3 storage for every media message in the response when
      // downloadMedia=true; fetching the full lookback window in a single call
      // would force WAHA to re-upload media that we deleted from R2 after past
      // successful conversions. Walking back stops as soon as the most recent
      // unprocessed receipt is found, so already-cleaned receipts further back
      // in history are never re-touched in the common case.
      let selectedMediaUrl: string | null = null;
      let selectedMimetype: string | null = null;
      let selectedMediaS3: { Bucket: string; Key: string } | null = null;

      for (let limit = 1; limit <= lookbackLimit; limit++) {
        const page = await fetchChatMessages(sessionName, chatId, { limit });
        if (page.length < limit) {
          // No more history to inspect.
          break;
        }
        // The newly-visible message in this page (oldest entry) — assuming
        // WAHA returns newest-first, which matches the iteration semantics
        // the previous implementation relied on.
        const candidate = page[limit - 1];

        if (!candidate.hasMedia || !candidate.media) {
          continue;
        }

        const { mimetype, url, s3 } = candidate.media;

        // Item #3: skip media sent by the cashier themselves (fromMe=true).
        // Only consider media sent BY the client (fromMe=false or undefined).
        // WAHA re-stored this in R2 while we walked past — track it for cleanup.
        if (candidate.fromMe === true) {
          if (s3) passedOverRefs.push(s3);
          continue;
        }

        // Accept both image/* and application/pdf (Pase 3: PDF support)
        if (mimetype.startsWith('image/') || mimetype === 'application/pdf') {
          selectedMediaUrl = url;
          selectedMimetype = mimetype;
          // Capture S3 metadata if present (used for post-conversion cleanup, Item #4)
          selectedMediaS3 = s3 ?? null;
          break;
        }

        // Non-eligible mimetype (audio/video/sticker/…). WAHA re-stored it
        // while we walked past — track it for cleanup.
        if (s3) passedOverRefs.push(s3);
      }

      if (!selectedMediaUrl || !selectedMimetype) {
        throw new NoImageFoundError('No image found in recent messages');
      }

      // Step 6: Download media
      let mediaBuffer: Buffer;
      try {
        const result = await downloadMedia(selectedMediaUrl);
        mediaBuffer = result.buffer;
        // Note: result.mimetype is intentionally discarded — WAHA's S3 proxy
        // returns `application/octet-stream` regardless of file type, which
        // OpenAI rejects with "Invalid MIME type". Trust the mimetype from
        // the WAHA message metadata (`selectedMimetype`) instead.
      } catch (err) {
        if (err instanceof AutoConversionError || err instanceof OpenAiUnavailableError) {
          throw err;
        }
        throw new MediaDownloadError(
          `Failed to download media: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Step 6b: If media is a PDF, render page 1 to PNG before OCR (Pase 3)
      let ocrBuffer = mediaBuffer;
      let ocrMimetype = selectedMimetype;
      if (selectedMimetype === 'application/pdf') {
        try {
          ocrBuffer = await renderPdfFirstPageToPng(mediaBuffer);
          ocrMimetype = 'image/png';
        } catch (err) {
          throw new MediaDownloadError(
            `Failed to render PDF: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Step 7: OCR extract amount
      const amount = await extractAmountFromImage(ocrBuffer, ocrMimetype);
      if (amount === null) {
        throw new OcrUnreadableError('OCR returned null amount');
      }
      resolvedAmount = amount;

      // Step 7b: Item #6 — Min/Max amount validation (after OCR, before lead lookup)
      const [minAmount, maxAmount] = await Promise.all([getMinAmount(), getMaxAmount()]);
      if (minAmount > 0 && amount < minAmount) {
        throw new AmountBelowMinError(amount, minAmount);
      }
      if (maxAmount > 0 && amount > maxAmount) {
        throw new AmountAboveMaxError(amount, maxAmount);
      }

      // Step 8: Resolve lead by phone (normalize chatId to digits only)
      const phone = normalizePhone(chatId);
      const lead = await findLeadByPhoneForCashier(phone, cashierId);
      if (!lead) {
        throw new LeadNotFoundError(`No lead found for phone ${phone} and cashier ${cashierId}`);
      }
      resolvedLeadCode = lead.code;

      // Step 9: Create conversion
      const result = await createConversion(cashierId, lead.id, amount, {
        source: 'AUTO_OCR',
        sourceMessageId: messageId,
      });

      if (result.kind === 'DUPLICATE') {
        // Silent — idempotent retry or duplicate webhook.
        // Do NOT delete: the original creating call already deleted, or it was an idempotency retry.
        logger.info({
          event: 'auto_conversion_duplicate',
          sessionName,
          chatId,
          messageId,
          cashierId,
        });
        return;
      }

      // SUCCESS — no reply sent
      logger.info({
        event: 'auto_conversion_created',
        sessionName,
        chatId,
        messageId,
        cashierId,
        leadId: lead.id,
        amount,
      });

      // Item #4: Delete the validated receipt from R2 after successful CREATED conversion.
      // Failure is non-fatal — conversion is already committed in DB.
      if (selectedMediaS3) {
        try {
          await deleteReceipt(selectedMediaS3.Bucket, selectedMediaS3.Key);
        } catch (deleteErr) {
          logger.warn({
            event: 'auto_conversion_receipt_delete_failed',
            bucket: selectedMediaS3.Bucket,
            key: selectedMediaS3.Key,
            err: String(deleteErr),
          });
        }
      }
    } catch (err) {
      // Item #2: build the rich-format reply (Option B) with whatever context
      // was resolved up to the point of failure.
      const richReply = buildErrorReply({
        error: err,
        clientPhone: chatId,
        whenIso: new Date().toISOString(),
        leadCode: resolvedLeadCode,
        amount: resolvedAmount,
      });

      // Handle known AutoConversionError family + OpenAiUnavailableError
      if (err instanceof AutoConversionError || err instanceof OpenAiUnavailableError) {
        logger.warn({
          event: 'auto_conversion_error',
          code: err instanceof AutoConversionError ? err.code : 'OPENAI_UNAVAILABLE',
          message: err.message,
          sessionName,
          chatId,
          cashierId,
        });
        try {
          // Item #2: send to cashier's own chat (errorReplyChatId), fallback to client chat
          await sendText(sessionName, errorReplyChatId, richReply);
        } catch (sendErr) {
          logger.error({
            event: 'auto_conversion_send_reply_failed',
            err: sendErr,
            originalError: err.message,
          });
        }
        return;
      }

      // Unknown / unexpected error
      logger.error({
        event: 'auto_conversion_unexpected_error',
        err,
        stack: err instanceof Error ? err.stack : undefined,
        sessionName,
        chatId,
        cashierId,
      });
      try {
        // Item #2: send to cashier's own chat (errorReplyChatId), fallback to client chat
        await sendText(sessionName, errorReplyChatId, richReply);
      } catch (sendErr) {
        logger.error({
          event: 'auto_conversion_send_reply_failed',
          err: sendErr,
        });
      }
      // DO NOT rethrow — job must succeed for BullMQ
    } finally {
      // Cleanup: delete every media WAHA re-uploaded while we walked past it
      // but didn't end up selecting (cashier-sent media, non-image/pdf types).
      // Failures are non-fatal; conversion outcome is already settled.
      for (const ref of passedOverRefs) {
        try {
          await deleteReceipt(ref.Bucket, ref.Key);
        } catch (cleanupErr) {
          logger.warn({
            event: 'auto_conversion_passed_over_delete_failed',
            bucket: ref.Bucket,
            key: ref.Key,
            err: String(cleanupErr),
          });
        }
      }
    }
  }

  return { handleCashierTriggerMessage };
}

// ---------------------------------------------------------------------------
// Module-level default wiring
// (Used by the processor in Batch 8. Dependencies wired from real modules.)
// ---------------------------------------------------------------------------

/**
 * Lazily constructs and memoizes default deps on first call.
 * This avoids top-level await and circular import issues at module load time.
 */
let _defaultService:
  | ReturnType<typeof createAutoConversionService>
  | null = null;

async function getDefaultService(): Promise<ReturnType<typeof createAutoConversionService>> {
  if (_defaultService) return _defaultService;

  // Lazy imports to avoid circular deps at module load time
  const [
    { getSetting },
    { SETTING_KEYS },
    { getSessionBySessionName },
    wahaClient,
    { extractAmountFromImage },
    { findMostRecentLeadByPhoneForCashier },
    { createConversionService },
    { createBudgetChecker },
    { config },
    { logger },
    s3Client,
    { renderPdfFirstPageToPng },
  ] = await Promise.all([
    import('../system-settings/service.js'),
    import('../system-settings/keys.js'),
    import('../cashier/whatsapp-session.repository.js'),
    import('../../integrations/waha/client.js'),
    import('../../integrations/openai/client.js'),
    import('./repository.js'),
    import('../cashier/cashier.service.js'),
    import('./budget.js'),
    import('../../config/env.js'),
    import('../../lib/logger.js'),
    import('../../integrations/s3/client.js'),
    import('../../integrations/pdf/render.js'),
  ]);

  // Redis: create a dedicated ioredis connection using the BullMQ Redis URL.
  // We do NOT reuse the BullMQ Worker's internal connection (not accessible
  // from outside bullmq). Instead, we create a lightweight separate ioredis
  // connection that only needs INCR + EXPIRE.
  const { Redis } = await import('ioredis');
  const redis = new Redis(config.BULLMQ_REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  const budgetChecker = createBudgetChecker(redis, {
    dailyLimit: config.AUTO_OCR_DAILY_LIMIT,
  });

  const deps: AutoConversionDeps = {
    getTriggerPhrase: () => getSetting(SETTING_KEYS.AUTO_CONVERSION_TRIGGER_PHRASE),

    resolveCashierIdBySession: async (sessionName: string) => {
      const row = await getSessionBySessionName(sessionName);
      return row?.cashierId ?? null;
    },

    fetchChatMessages: (sessionName, chatId, opts) =>
      // downloadMedia=true is required so WAHA populates the `media` field
      // (url, mimetype, s3) on each message. With downloadMedia=false the
      // field comes back as `null` even when the message has media stored.
      wahaClient.getChatMessages(sessionName, chatId, { limit: opts.limit, downloadMedia: true }),

    downloadMedia: (url) => wahaClient.downloadMedia(url),

    extractAmountFromImage,

    findLeadByPhoneForCashier: findMostRecentLeadByPhoneForCashier,

    createConversion: async (cashierId, leadId, amount, options) => {
      const result = await createConversionService(cashierId, leadId, amount, {
        source: options.source,
        sourceMessageId: options.sourceMessageId,
      });
      if (result.kind === 'CREATED') {
        return { kind: 'CREATED', conversion: result.conversion };
      }
      if (result.kind === 'DUPLICATE') {
        return { kind: 'DUPLICATE', sourceMessageId: result.sourceMessageId };
      }
      // NOT_FOUND / INVALID_STATUS / PHONE_REQUIRED treated as unexpected upstream
      throw new Error(`createConversionService returned unexpected kind: ${result.kind}`);
    },

    budgetCheckAndIncrement: (cashierId) => budgetChecker.checkAndIncrement(cashierId),

    sendText: (sessionName, chatId, text) => wahaClient.sendText(sessionName, chatId, text),

    getOwnChatId: async (sessionName: string) => {
      // Item #2: resolve the cashier's own WhatsApp JID via getOwnChatId in waha client.
      // Wraps in try/catch so a WAHA network error doesn't abort the flow.
      try {
        return await wahaClient.getOwnChatId(sessionName);
      } catch {
        return null;
      }
    },

    getMinAmount: async () => {
      const raw = await getSetting(SETTING_KEYS.AUTO_CONVERSION_MIN_AMOUNT);
      const parsed = parseInt(raw, 10);
      return isNaN(parsed) ? 0 : parsed;
    },

    getMaxAmount: async () => {
      const raw = await getSetting(SETTING_KEYS.AUTO_CONVERSION_MAX_AMOUNT);
      const parsed = parseInt(raw, 10);
      return isNaN(parsed) ? 0 : parsed;
    },

    // Item #4: Delete validated receipt from R2 after successful conversion.
    // R2 credentials are read at call time from process.env. If any credential is
    // missing, s3Client.deleteObject throws R2NotConfiguredError which the service
    // catches and logs as a warning (non-fatal).
    deleteReceipt: async (bucket: string, key: string) => {
      await s3Client.deleteObject(bucket, key);
    },

    // Pase 3: PDF-to-PNG rendering for OCR
    renderPdfFirstPageToPng,

    logger: {
      info: (...args) => logger.info(...(args as Parameters<typeof logger.info>)),
      warn: (...args) => logger.warn(...(args as Parameters<typeof logger.warn>)),
      error: (...args) => logger.error(...(args as Parameters<typeof logger.error>)),
    },

    lookbackLimit: 20,
  };

  _defaultService = createAutoConversionService(deps);
  return _defaultService;
}

/**
 * Module-level entry point used by the inbound processor (Batch 8).
 * Lazily assembles real deps on first call.
 */
export async function handleCashierTriggerMessage(payload: TriggerPayload): Promise<void> {
  const service = await getDefaultService();
  return service.handleCashierTriggerMessage(payload);
}
