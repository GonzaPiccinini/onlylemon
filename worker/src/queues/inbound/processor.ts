import { Job } from 'bullmq';
import { z } from 'zod';
import { mapLeadsToPhone } from '../../integrations/leads/http.js';
import { validateJobIdempotency } from '../../modules/idempotency/idempotency.service.js';

const InboundJobSchema = z.object({
  session: z.string().min(1),
  payload: z.object({
    id: z.string().min(1),
    from: z.string().min(1),
    body: z.string().optional().default(''),
  }),
});

export async function processInboundJob(job: Job) {
  try {
    const parsedData = InboundJobSchema.safeParse(job.data);
    if (parsedData.error) {
      console.error(`Error parsing job data: ${parsedData.error.message}`);
      return;
    }

    const data = parsedData.data;
    const jobKey = `${data.session}:${data.payload.id}`;
    const isFirstProcessing = await validateJobIdempotency(
      jobKey,
      'inbound_processor',
    );

    if (!isFirstProcessing) {
      console.info('Skipping duplicated job', {
        jobId: job.id,
        jobKey,
      });
      return;
    }

    await mapLeadsToPhone(data.session, data.payload.from, data.payload.body);
  } catch (error) {
    console.error(`Error processing inbound job ${job.id}: ${error}`);
    throw error;
  }
}
