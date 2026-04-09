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
  cashierId: string,
  chatId: string,
  fromAds: boolean,
) {
  try {
    const chatExists = await getChat(cashierId, chatId);
    if (chatExists) throw new Error('Chat already exists');

    await prisma.chat.create({
      data: {
        phone: chatId,
        cashierId,
        fromAds,
      },
    });
  } catch (error) {
    console.error(`Error saving chat: ${error}`);
  }
}

export async function getChat(cashierId: string, chatId: string) {
  try {
    return await prisma.chat.findFirst({
      where: {
        phone: chatId,
        cashierId,
      },
    });
  } catch (error) {
    console.error(`Error getting chat: ${error}`);
    return null;
  }
}
