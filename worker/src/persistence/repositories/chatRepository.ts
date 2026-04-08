import z from 'zod';
import { prisma } from '../prisma/client.js';

export const JobSchema = z.object({
  session: z.string().min(1),
  payload: z.object({
    id: z.string().min(1),
    timestamp: z.number().transform((val) => val * 1000),
    from: z.string(),
    body: z.string().min(1).optional(),
    fromMe: z.boolean(),
    hasMedia: z.boolean(),
    media: z
      .object({
        url: z.string(),
        mimetype: z.string(),
        s3: z.object({
          Bucket: z.string(),
          Key: z.string(),
        }),
      })
      .nullable(),
  }),
});

type InboundJobData = z.infer<typeof JobSchema>;

export async function saveChat(
  sessionId: string,
  chatId: string,
  fromAds: boolean,
) {
  try {
    const chatExists = await getChat(sessionId, chatId);
    if (chatExists) throw new Error('Chat already exists');

    await prisma.chat.create({
      data: {
        id: chatId,
        sessionId,
        fromAds,
      },
    });
  } catch (error) {
    console.error(`Error saving chat: ${error}`);
  }
}

export async function getChat(sessionId: string, chatId: string) {
  try {
    return await prisma.chat.findFirst({
      where: {
        id: chatId,
        sessionId,
      },
    });
  } catch (error) {
    console.error(`Error getting chat: ${error}`);
    return null;
  }
}
