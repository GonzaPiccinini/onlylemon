import { randomUUID } from 'node:crypto';
import z from 'zod';
import { prisma } from './prisma.js';
import { JobSchema } from './langGraph/states.js';

type InboundJobData = z.infer<typeof JobSchema>;

type WorkerMessageInput = {
  session: string;
  chatId: string;
  body: string;
};

async function ensureChatExists(sessionName: string, chatId: string) {
  await prisma.chat.upsert({
    where: {
      id: chatId,
    },
    update: {},
    create: {
      id: chatId,
      session: {
        connect: {
          name: sessionName,
        },
      },
    },
  });
}

export async function saveInboundMessage(jobData: InboundJobData) {
  const { session, payload } = jobData;

  await ensureChatExists(session, payload.from);

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
}

export async function saveWorkerMessage({
  session,
  chatId,
  body,
}: WorkerMessageInput) {
  await ensureChatExists(session, chatId);

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
