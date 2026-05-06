import { z } from 'zod';

export const createConversionSchema = z.object({
  amount: z.coerce.number().min(3000),
});

/** @deprecated Use createConversionSchema instead */
export const convertLeadSchema = createConversionSchema;

export type ConvertLeadPayload = z.infer<typeof createConversionSchema>;

export const leadStatusSchema = z
  .enum(['NOT_CONTACTED', 'CONTACTED', 'CONVERTED'])
  .optional();

export const completeWhatsappLinkSchema = z.object({
  sessionName: z.string().trim().min(1),
});

export const startWhatsappLinkSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{8,15}$/, 'Invalid phone number'),
});

export const updateAccountSchema = z
  .object({
    username: z.string().trim().min(3).optional(),
    password: z.string().min(6).optional(),
  })
  .refine((value) => Boolean(value.username || value.password), {
    message: 'At least one field is required',
  });
