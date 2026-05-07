import { z } from 'zod';

export const createConversionSchema = z.object({
  amount: z.coerce.number().min(3000),
});


export type ConvertLeadPayload = z.infer<typeof createConversionSchema>;

export const cashierConversionsFilterSchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  phone: z.string().trim().min(1).optional(),
  code:  z.string().trim().min(1).optional(),
  amountMin: z.coerce.number().optional(),
  amountMax: z.coerce.number().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type CashierConversionsFilterQuery = z.infer<typeof cashierConversionsFilterSchema>;

export const cashierLeadsFilterSchema = z.object({
  statuses: z.array(z.enum(['CONTACTED', 'CONVERTED'])).optional(),
  code:   z.string().trim().min(1).optional(),
  phone:  z.string().trim().min(1).optional(),
});
export type CashierLeadsFilterQuery = z.infer<typeof cashierLeadsFilterSchema>;

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
