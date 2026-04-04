import { StateSchema } from '@langchain/langgraph';
import z from 'zod';

const IntentSchema = z.enum([
  'create_user',
  'load_balance',
  'contact_support',
  'unknown',
]);
const EntitySchema = z.object({
  name: z.string().nullable(),
  amount: z.number().nullable(),
});
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

export const MessageClassificationSchema = z.object({
  intent: IntentSchema,
  entity: EntitySchema,
});

export const ChatState = new StateSchema({
  intent: IntentSchema,
  entity: EntitySchema,
  job: JobSchema,
});
