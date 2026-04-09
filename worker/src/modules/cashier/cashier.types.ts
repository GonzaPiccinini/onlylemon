import { z } from 'zod';

export const addFundsSchema = z.object({
  userName: z.string().trim().min(2),
  phoneNumber: z.string().trim().min(4),
  amount: z.coerce.number().positive(),
});

export type AddFundsPayload = z.infer<typeof addFundsSchema>;
