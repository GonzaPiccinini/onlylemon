import { Job } from 'bullmq';
import { JobSchema, getChat } from '../../persistence/repositories/chatRepository.js';
import { mapLeadsToPhone } from '../../integrations/leads/http.js';
import { validateJobIdempotency } from '../../modules/idempotency/idempotency.service.js';

export async function processInboundJob(job: Job) {
  try {
    // parsear data del job
    const parsedData = JobSchema.safeParse(job.data);
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

    // validar si es el primer mensaje del chat
    const chat = await getChat(data.session, data.payload.from);
    if (!chat) {
      // verificar si existe codigo de leads en el mensaje
      await mapLeadsToPhone(
        data.session,
        data.payload.from,
        data.payload.body ? data.payload.body : '',
      );
    }
  } catch (error) {
    console.error(`Error processing inbound job ${job.id}: ${error}`);
    throw error;
  }
}
