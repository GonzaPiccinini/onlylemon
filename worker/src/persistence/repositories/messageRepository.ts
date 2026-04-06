import { randomUUID } from 'node:crypto';
import z from 'zod';
import { prisma } from '../prisma/client.js';
import { JobSchema } from '../../state/langgraph/states.js';

type InboundJobData = z.infer<typeof JobSchema>;

type WorkerMessageInput = {
  session: string;
  chatId: string;
  body: string;
};

export async function saveChat(sessionName: string, chatId: string) {
  try {
    const chatExists = await getChat(sessionName, chatId);
    if (chatExists) throw new Error('Chat already exists');

    await prisma.chat.create({
      data: {
        id: chatId,
        sessionName,
      },
    });
  } catch (error) {
    console.error(`Error saving chat: ${error}`);
  }
}

export async function getChat(sessionName: string, chatId: string) {
  try {
    return await prisma.chat.findFirst({
      where: {
        id: chatId,
        sessionName,
      },
    });
  } catch (error) {
    console.error(`Error getting chat: ${error}`);
  }
}

export async function saveInboundMessage(jobData: InboundJobData) {
  try {
    const { session, payload } = jobData;

    const chatExists = await getChat(session, payload.from);
    if (!chatExists) throw new Error('Chat not exists');

    await prisma.message.upsert({
      where: {
        id: payload.id,
      },
      update: {
        timestamp: new Date(payload.timestamp),
        body: payload.body,
        hasMedia: payload.hasMedia,
        media: payload.media ?? undefined,
        submittedByUser: !payload.fromMe,
        chatId: payload.from,
      },
      create: {
        id: payload.id,
        timestamp: new Date(payload.timestamp),
        body: payload.body,
        hasMedia: payload.hasMedia,
        media: payload.media ?? undefined,
        submittedByUser: !payload.fromMe,
        chat: {
          connect: {
            id: payload.from,
          },
        },
      },
    });
  } catch (error) {
    console.error(`Error saving inbound message: ${error}`);
  }
}

export async function saveWorkerMessage({
  session,
  chatId,
  body,
}: WorkerMessageInput) {
  await getChat(session, chatId);

  await prisma.message.create({
    data: {
      id: `worker-${randomUUID()}`,
      timestamp: new Date(),
      body,
      hasMedia: false,
      submittedByUser: false,
      chat: {
        connect: {
          id: chatId,
        },
      },
    },
  });
}
