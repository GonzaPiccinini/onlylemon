import { Job } from 'bullmq';
import { z } from 'zod';
import { SETTING_KEYS } from '../../modules/system-settings/keys.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * H2 — Extended InboundMessageSchema with optional media payload fields.
 * Locked shape per design-clarifications:
 *   payload.fromMe: boolean (optional, absent in legacy WAHA events)
 *   payload.hasMedia: boolean (optional)
 *   payload.media: { url, mimetype, s3: { bucket, key } } (optional, nullable)
 *
 * body is optional/nullable to tolerate media-only messages from WAHA.
 * passthrough() allows future WAHA fields without schema breakage.
 */
const InboundMessageSchema = z.object({
  id: z.string().min(1).optional(),
  event: z.enum(['message', 'message.any']).optional(),
  session: z.string().min(1),
  payload: z
    .object({
      id: z.string().min(1),
      from: z.string().min(1),
      body: z.string().optional().nullable().default(''),
      fromMe: z.boolean().optional(),
      hasMedia: z.boolean().optional(),
      media: z
        .object({
          url: z.string(),
          mimetype: z.string(),
          s3: z.object({
            Bucket: z.string(),
            Key: z.string(),
          }),
        })
        .optional()
        .nullable(),
    })
    .passthrough(),
});

const InboundSessionStatusSchema = z.object({
  id: z.string().min(1).optional(),
  event: z.literal('session.status'),
  session: z.string().min(1),
  timestamp: z.coerce.number().optional(),
  payload: z.object({
    status: z.enum([
      'STOPPED',
      'STARTING',
      'SCAN_QR_CODE',
      'WORKING',
      'FAILED',
    ]),
    statuses: z
      .array(
        z.object({
          status: z.enum([
            'STOPPED',
            'STARTING',
            'SCAN_QR_CODE',
            'WORKING',
            'FAILED',
          ]),
          timestamp: z.coerce.number(),
        }),
      )
      .optional(),
  }),
});

/**
 * InboundReactionSchema — message.reaction webhook envelope.
 *
 * Shape confirmed by live capture during whatsapp-chat-ui Batch 16 manual QA
 * (WAHA GOWS 2026.3.4). The earlier batch-0 inference was wrong.
 *
 * Key mapping:
 *   payload.reaction.messageId → target messageId for mirrorChatReaction (GOWS).
 *   payload.reaction.msgId._serialized → same, for legacy WEBJS engines.
 *   payload.from → chatId (reactor's JID).
 *   payload.fromMe → boolean (true when the session owner reacted).
 *
 * NOTE: GOWS sends `payload.to` as null and the reaction target as a flat
 * `reaction.messageId` string. WEBJS nests it in `reaction.msgId._serialized`.
 * Both are accepted. passthrough() keeps forward-incompatible payloads alive.
 */
const InboundReactionSchema = z.object({
  id: z.string().optional(),
  event: z.literal('message.reaction'),
  session: z.string().min(1),
  payload: z.object({
    id: z.string().optional(),
    from: z.string().nullable().optional(),
    fromMe: z.boolean().optional(),
    to: z.string().nullable().optional(),
    timestamp: z.number().optional(),
    reaction: z.object({
      text: z.string(), // emoji or '' to remove
      // Real WAHA GOWS 2026.3.4 shape: a flat target message ID string.
      messageId: z.string().optional(),
      // Legacy WEBJS-engine shape: target ID nested under msgId._serialized.
      msgId: z.object({
        fromMe: z.boolean().optional(),
        remote: z.string().optional(),
        id: z.string().optional(),
        _serialized: z.string(), // full serialized target message ID
      }).passthrough().optional(),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

const InboundJobSchema = z.union([
  InboundMessageSchema,
  InboundSessionStatusSchema,
  InboundReactionSchema,
]);

// ---------------------------------------------------------------------------
// Injectable deps type (for testing)
// ---------------------------------------------------------------------------

export type InboundProcessorDeps = {
  handleCashierTriggerMessage: (payload: {
    sessionName: string;
    chatId: string;
    messageId: string;
    body: string;
    fromMe: boolean;
  }) => Promise<void>;
  mapLeadsToPhone: (session: string, from: string, body: string) => Promise<void>;
  validateJobIdempotency: (jobKey: string, processorName: string) => Promise<boolean>;
  processWhatsappSessionStatusService: (
    session: string,
    status: string,
    timestamp: Date,
  ) => Promise<unknown>;
  /** Returns the current trigger phrase, or '' when not configured */
  getSetting: (key: string) => Promise<string>;
  /**
   * Fan-out seam for chat UI — called for every inbound/outbound message event.
   * Wired to the real chat-events bus in Batch 11; defaults to no-op here.
   * Called AFTER the existing routing decision so auto-conversion + mapLeadsToPhone
   * behavior is unchanged (acceptance criterion #4).
   */
  mirrorChatMessage: (payload: {
    sessionName: string;
    chatId: string;
    messageId: string;
    timestamp?: number;
    body: string;
    fromMe: boolean;
    hasMedia: boolean;
    mediaMimetype?: string | null;
    quotedMessage?: { id: string; body?: string | null; fromMe?: boolean } | null;
  }) => Promise<void>;
  /**
   * Fan-out seam for chat UI — called for every message.reaction event.
   * Wired to the real chat-events bus in Batch 11; defaults to no-op here.
   * On schema mismatch the processor logs a warn and skips (does not throw).
   */
  mirrorChatReaction: (payload: {
    sessionName: string;
    chatId: string;
    messageId: string;
    reaction: string;
    fromMe: boolean;
  }) => Promise<void>;
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  metrics: {
    jobsTotal: { labels: (...args: string[]) => { inc: () => void } };
    jobDurationSeconds: { labels: (...args: string[]) => { observe: (v: number) => void } };
  };
};

// ---------------------------------------------------------------------------
// Factory (for testing with injectable deps)
// ---------------------------------------------------------------------------

/**
 * Creates a processor function bound to the given deps.
 * The default `processInboundJob` export uses real production deps.
 * Tests inject mocks via this factory — no module-level imports of env-dependent
 * collaborators needed in tests.
 */
export function createInboundProcessor(deps: InboundProcessorDeps): (job: Job) => Promise<void> {
  return async function processJob(job: Job): Promise<void> {
    const startedAt = process.hrtime.bigint();
    const eventType = job.name;

    try {
      const parsedData = InboundJobSchema.safeParse(job.data);
      if (parsedData.error) {
        deps.logger.error(
          { jobId: job.id, eventType, err: parsedData.error.message },
          'job_parse_error',
        );
        deps.metrics.jobsTotal.labels('parse_error', eventType).inc();
        return;
      }

      const data = parsedData.data;
      const jobKey = data.id
        ? `${data.event ?? 'message'}:${data.id}`
        : data.event === 'session.status'
          ? `${data.session}:${data.payload.status}:${data.timestamp ?? Date.now()}`
          : `${data.session}:${data.payload.id}`;

      const isFirstProcessing = await deps.validateJobIdempotency(jobKey, 'inbound_processor');

      if (!isFirstProcessing) {
        deps.logger.info({ jobId: job.id, jobKey, eventType }, 'job_duplicate_skipped');
        deps.metrics.jobsTotal.labels('duplicate', eventType).inc();
        return;
      }

      if (data.event === 'session.status') {
        const latestTimestamp =
          data.payload.statuses?.at(-1)?.timestamp ??
          data.timestamp ??
          Date.now();

        await deps.processWhatsappSessionStatusService(
          data.session,
          data.payload.status,
          new Date(latestTimestamp),
        );
      } else if (data.event === 'message.reaction') {
        // Batch 2 — message.reaction branch.
        // If anything goes wrong, log a warn and skip — do NOT throw.
        try {
          const reactionPayload = data.payload as {
            from?: string | null;
            fromMe?: boolean;
            reaction: {
              text: string;
              messageId?: string;
              msgId?: { _serialized?: string };
            };
          };
          // Real WAHA GOWS 2026.3.4 uses a flat `reaction.messageId` string.
          // Legacy WEBJS engines nest it under `reaction.msgId._serialized`.
          const targetMessageId =
            reactionPayload.reaction.messageId ??
            reactionPayload.reaction.msgId?._serialized;
          if (!targetMessageId) {
            deps.logger.warn(
              { jobId: job.id, eventType },
              'mirror_chat_reaction_skip',
            );
          } else {
            await deps.mirrorChatReaction({
              sessionName: data.session,
              chatId: reactionPayload.from ?? '',
              messageId: targetMessageId,
              reaction: reactionPayload.reaction.text,
              fromMe: reactionPayload.fromMe ?? false,
            });
          }
        } catch (reactionErr) {
          deps.logger.warn(
            { jobId: job.id, eventType, err: reactionErr },
            'mirror_chat_reaction_skip',
          );
        }
      } else {
        // H3 — Auto-conversion branch
        // For message / message.any events: check if this is a cashier outbound
        // trigger message that should route to handleCashierTriggerMessage.
        if (data.payload.fromMe === true) {
          const triggerPhrase = await deps.getSetting(SETTING_KEYS.AUTO_CONVERSION_TRIGGER_PHRASE);
          // The setting may hold one or more phrases separated by newlines.
          // Match if the body equals (case-insensitively, after trim) any phrase.
          const triggerPhrases = triggerPhrase
            .split('\n')
            .map((p) => p.trim().toLowerCase())
            .filter((p) => p.length > 0);
          const bodyNormalized = (data.payload.body ?? '').trim().toLowerCase();

          if (triggerPhrases.length > 0 && triggerPhrases.includes(bodyNormalized)) {
            // Outbound trigger match — delegate to auto-conversion service.
            // Defensive try/catch: Batch 6 already catches all known errors internally,
            // but we add one final guard to prevent BullMQ infinite retries.
            try {
              // WAHA returns `payload.from` as a LID (e.g.
              // `37830675939455@lid`) when the chat is addressed via LID. The
              // real phone JID lives in different fields depending on engine:
              //   NOWEB: `payload._data.key.remoteJidAlt`
              //   GOWS (outbound): `payload._data.Info.RecipientAlt`
              //   GOWS (inbound):  `payload._data.Info.SenderAlt`
              // We only branch on outbound (fromMe=true) so RecipientAlt is
              // what we want; fall back to the legacy NOWEB path and finally
              // to `payload.from`.
              const payloadAny = data.payload as Record<string, unknown>;
              const dataAny = payloadAny._data as
                | {
                    Info?: { RecipientAlt?: string; SenderAlt?: string };
                    key?: { remoteJidAlt?: string };
                  }
                | undefined;
              const resolvedChatId =
                dataAny?.Info?.RecipientAlt ??
                dataAny?.key?.remoteJidAlt ??
                data.payload.from;
              await deps.handleCashierTriggerMessage({
                sessionName: data.session,
                chatId: resolvedChatId,
                messageId: data.payload.id,
                body: data.payload.body ?? '',
                fromMe: true,
              });
            } catch (autoConvErr) {
              deps.logger.error(
                { jobId: job.id, eventType, err: autoConvErr },
                'auto_conversion_unexpected_processor_error',
              );
            }

            // Batch 2 — fan-out chat message AFTER existing routing decision.
            // Called unconditionally even on the trigger path (acceptance criterion #4).
            await deps.mirrorChatMessage({
              sessionName: data.session,
              chatId: data.payload.from,
              messageId: data.payload.id,
              body: data.payload.body ?? '',
              fromMe: data.payload.fromMe ?? false,
              hasMedia: data.payload.hasMedia ?? false,
              mediaMimetype: (data.payload.media as { mimetype?: string } | null | undefined)?.mimetype ?? null,
            });

            const durationSeconds =
              Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
            deps.metrics.jobDurationSeconds.labels(eventType).observe(durationSeconds);
            return;
          }
        }

        // Existing path: inbound messages OR outbound messages that don't match trigger
        await deps.mapLeadsToPhone(data.session, data.payload.from, data.payload.body ?? '');

        // Batch 2 — fan-out chat message AFTER existing routing decision (additive).
        // This call is unconditional for message/message.any events so the chat UI
        // receives ALL inbound + outbound messages regardless of routing.
        await deps.mirrorChatMessage({
          sessionName: data.session,
          chatId: data.payload.from,
          messageId: data.payload.id,
          body: data.payload.body ?? '',
          fromMe: data.payload.fromMe ?? false,
          hasMedia: data.payload.hasMedia ?? false,
          mediaMimetype: (data.payload.media as { mimetype?: string } | null | undefined)?.mimetype ?? null,
        });
      }

      const durationSeconds =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      deps.metrics.jobDurationSeconds.labels(eventType).observe(durationSeconds);
    } catch (error) {
      const durationSeconds =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      deps.metrics.jobDurationSeconds.labels(eventType).observe(durationSeconds);

      deps.logger.error({ jobId: job.id, eventType, err: error }, 'job_processing_error');
      throw error;
    }
  };
}

// ---------------------------------------------------------------------------
// Module-level default export (real production deps — lazy loaded)
// ---------------------------------------------------------------------------

/**
 * Real production processor — lazily assembles deps on first call.
 * Lazy loading avoids pulling env.ts / prisma at module parse time, which
 * would break test isolation (same technique used in auto-conversion/service.ts).
 */
let _realProcessor: ((job: Job) => Promise<void>) | null = null;

async function getRealProcessor(): Promise<(job: Job) => Promise<void>> {
  if (_realProcessor) return _realProcessor;

  const [
    { mapLeadsToPhone },
    { validateJobIdempotency },
    { processWhatsappSessionStatusService },
    { handleCashierTriggerMessage },
    { getSetting },
    { logger },
    { bullmqJobDurationSeconds, bullmqJobsTotal },
    { getSessionBySessionName },
    { publishChatMessage, publishChatReaction },
    { createChatMessageFanout, createChatReactionFanout },
  ] = await Promise.all([
    import('../../integrations/leads/http.js'),
    import('../../modules/idempotency/idempotency.service.js'),
    import('../../modules/cashier/cashier.service.js'),
    import('../../modules/auto-conversion/service.js'),
    import('../../modules/system-settings/service.js'),
    import('../../lib/logger.js'),
    import('../../lib/metrics.js'),
    import('../../modules/cashier/whatsapp-session.repository.js'),
    import('../../modules/chat/chat.events.js'),
    import('../../modules/chat/chat-fanout.js'),
  ]);

  // Build the fan-out logger adapter (InboundProcessorDeps.logger shape already resolved)
  const fanoutLogger = {
    warn: (...args: unknown[]) => logger.warn(...(args as Parameters<typeof logger.warn>)),
    error: (...args: unknown[]) => logger.error(...(args as Parameters<typeof logger.error>)),
    info: (...args: unknown[]) => logger.info(...(args as Parameters<typeof logger.info>)),
  };

  // Batch 11 — wire fan-out deps to the real chat-events bus.
  // createChatMessageFanout/createChatReactionFanout resolve WAHA sessionName →
  // { sessionId, cashierId } via getSessionBySessionName, then publish on the bus.
  // Fan-out is best-effort: errors are logged and swallowed; never throws.
  const mirrorChatMessage = createChatMessageFanout({
    getSessionBySessionName,
    publishChatMessage,
    publishChatReaction,
    logger: fanoutLogger,
  });

  const mirrorChatReaction = createChatReactionFanout({
    getSessionBySessionName,
    publishChatMessage,
    publishChatReaction,
    logger: fanoutLogger,
  });

  const realDeps: InboundProcessorDeps = {
    handleCashierTriggerMessage,
    mapLeadsToPhone,
    validateJobIdempotency,
    processWhatsappSessionStatusService,
    getSetting,
    mirrorChatMessage,
    mirrorChatReaction,
    logger: {
      info: (...args) => logger.info(...(args as Parameters<typeof logger.info>)),
      warn: (...args) => logger.warn(...(args as Parameters<typeof logger.warn>)),
      error: (...args) => logger.error(...(args as Parameters<typeof logger.error>)),
    },
    metrics: {
      jobsTotal: bullmqJobsTotal,
      jobDurationSeconds: bullmqJobDurationSeconds,
    },
  };

  _realProcessor = createInboundProcessor(realDeps);
  return _realProcessor;
}

export async function processInboundJob(job: Job): Promise<void> {
  const processor = await getRealProcessor();
  return processor(job);
}
