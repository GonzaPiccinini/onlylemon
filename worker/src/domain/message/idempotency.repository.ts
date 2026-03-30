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
        session: input.session,
        messageId: input.messageId,
      },
    });
    if (processedMessage) return false;
    await prisma.processedMessage.create({
      data: {
        session: input.session,
        chatId: input.chatId,
        messageId: input.messageId,
        jobId: input.jobId,
      },
    });

    return true;
  } catch {
    return false;
  }
}
