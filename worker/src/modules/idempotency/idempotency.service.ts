import { Prisma } from '../../generated/prisma/client.js';
import { registerProcessedJob } from './idempotency.repository.js';

export const validateJobIdempotency = async (
  jobKey: string,
  source: string,
): Promise<boolean> => {
  try {
    await registerProcessedJob(jobKey, source);
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return false;
    }

    throw error;
  }
};
