import { prisma } from '../../core/prisma.js';

type CreateChatTransactionInput = {
  chatId: string;
  type: 'deposit';
  amount: number;
  status: 'success' | 'failed' | 'unknown';
  errorCode?: string;
};

export async function createChatTransaction(input: CreateChatTransactionInput) {
  return prisma.chatTransaction.create({
    data: {
      chatId: input.chatId,
      type: input.type,
      amount: input.amount,
      status: input.status,
      errorCode: input.errorCode,
    },
  });
}
