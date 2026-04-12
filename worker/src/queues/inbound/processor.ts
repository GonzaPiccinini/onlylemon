import { Job } from 'bullmq';
import { z } from 'zod';
import { mapLeadsToPhone } from '../../integrations/leads/http.js';
import { validateJobIdempotency } from '../../modules/idempotency/idempotency.service.js';
import { processWhatsappSessionStatusService } from '../../modules/cashier/cashier.service.js';
import { logger } from '../../lib/logger.js';
import { bullmqJobDurationSeconds, bullmqJobsTotal } from '../../lib/metrics.js';

const InboundMessageSchema = z.object({
  id: z.string().min(1).optional(),
  event: z.enum(['message', 'message.any']).optional(),
  session: z.string().min(1),
  payload: z.object({
    id: z.string().min(1),
    from: z.string().min(1),
    body: z.string().optional().default(''),
  }),
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

const InboundJobSchema = z.union([
  InboundMessageSchema,
  InboundSessionStatusSchema,
]);

export async function processInboundJob(job: Job) {
  const startedAt = process.hrtime.bigint();
  const eventType = job.name;

  try {
    const parsedData = InboundJobSchema.safeParse(job.data);
    if (parsedData.error) {
      logger.error(
        { jobId: job.id, eventType, err: parsedData.error.message },
        'job_parse_error',
      );
      bullmqJobsTotal.labels('parse_error', eventType).inc();
      return;
    }

    const data = parsedData.data;
    const jobKey = data.id
      ? `${data.event ?? 'message'}:${data.id}`
      : data.event === 'session.status'
        ? `${data.session}:${data.payload.status}:${data.timestamp ?? Date.now()}`
        : `${data.session}:${data.payload.id}`;
    const isFirstProcessing = await validateJobIdempotency(
      jobKey,
      'inbound_processor',
    );

    if (!isFirstProcessing) {
      logger.info({ jobId: job.id, jobKey, eventType }, 'job_duplicate_skipped');
      bullmqJobsTotal.labels('duplicate', eventType).inc();
      return;
    }

    if (data.event === 'session.status') {
      const latestTimestamp =
        data.payload.statuses?.at(-1)?.timestamp ??
        data.timestamp ??
        Date.now();

      await processWhatsappSessionStatusService(
        data.session,
        data.payload.status,
        new Date(latestTimestamp),
      );
    } else {
      await mapLeadsToPhone(data.session, data.payload.from, data.payload.body);
    }

    const durationSeconds =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
    bullmqJobDurationSeconds.labels(eventType).observe(durationSeconds);
  } catch (error) {
    const durationSeconds =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
    bullmqJobDurationSeconds.labels(eventType).observe(durationSeconds);

    logger.error({ jobId: job.id, eventType, err: error }, 'job_processing_error');
    throw error;
  }
}
