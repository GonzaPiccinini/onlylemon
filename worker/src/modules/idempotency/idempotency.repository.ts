import { prisma } from '../../persistence/prisma/client.js';

export const registerProcessedJob = async (jobKey: string, source: string) =>
  prisma.processedJob.create({
    data: {
      jobKey,
      source,
    },
  });
