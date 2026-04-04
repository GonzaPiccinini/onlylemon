import { Job } from 'bullmq';
import { chatGraph } from './langGraph/graphs.js';
import { JobSchema } from './langGraph/states.js';

export async function processInboundJob(job: Job) {
  try {
    // validar idempotencia del job

    // parsear data del job
    const parsedData = JobSchema.safeParse(job.data);
    if (parsedData.error) {
      console.error(`Error parsing job data: ${parsedData.error.message}`);
      return;
    }
    const data = parsedData.data;

    // invocar (reanudar) grafo del chat
    await chatGraph.invoke(
      {
        intent: 'unknown',
        entity: {
          name: null,
          amount: null,
        },
        job: data,
      },
      {
        configurable: {
          thread_id: data.payload.from, // el thread_id == chatId, de esa forma identificamos el hilo de cada chat
        },
      },
    );
  } catch (error) {
    console.error(`Error processing inbound job ${job.id}: ${error}`);
    throw error;
  }
}
