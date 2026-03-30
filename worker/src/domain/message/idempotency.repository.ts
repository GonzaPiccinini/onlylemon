import { prisma } from '../../core/prisma.js';

type IdempotencyClaimInput = {
  session: string;
  chatId: string;
  messageId: string;
  jobId?: string;
};

export async function claimMessageProcessing(input: IdempotencyClaimInput) {
  try {
    const processedMessage = await prisma.processedMessage.findFirst({
      where: {
        ...input,
      },
    });
    if (processedMessage) return false;
    await prisma.processedMessage.create({
      data: { ...input },
    });

    return true;
  } catch {
    return false;
  }
}
