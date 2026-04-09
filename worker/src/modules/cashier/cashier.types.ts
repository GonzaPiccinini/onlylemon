import { z } from 'zod';

export const addFundsSchema = z.object({
  userName: z.string().trim().min(2),
  phoneNumber: z.string().trim().min(4),
  amount: z.coerce.number().positive(),
});

export type AddFundsPayload = z.infer<typeof addFundsSchema>;

export const completeWhatsappLinkSchema = z.object({
  sessionName: z.string().trim().min(1),
});

export const startWhatsappLinkSchema = z.object({
  phoneNumber: z.string().trim().regex(/^\+?[0-9]{8,15}$/, 'Invalid phone number'),
});
