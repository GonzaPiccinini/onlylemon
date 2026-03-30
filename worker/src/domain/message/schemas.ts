import { z } from 'zod';

export const inboundJobSchema = z.object({
  session: z.string().min(1),
  payload: z.object({
    id: z.string().min(1),
    from: z.string().min(1),
    body: z.string().min(1),
  }),
});

export type InboundJob = z.infer<typeof inboundJobSchema>;
