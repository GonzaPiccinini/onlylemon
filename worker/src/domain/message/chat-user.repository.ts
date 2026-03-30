import { prisma } from '../../core/prisma.js';

type UpsertChatUserInput = {
  chatId: string;
  username: string;
};

export async function upsertChatUser(input: UpsertChatUserInput) {
  return prisma.chatUser.upsert({
    where: { chatId: input.chatId },
    create: {
      chatId: input.chatId,
      username: input.username,
    },
    update: {
      username: input.username,
    },
  });
}

export async function findChatUserByChatId(chatId: string) {
  return prisma.chatUser.findUnique({
    where: { chatId },
  });
}
