import { z } from 'zod';

export const createCashierSchema = z.object({
  name: z.string().trim().min(2),
  username: z.string().trim().min(3),
  password: z.string().min(6),
});

export const updateCashierSchema = z.object({
  name: z.string().trim().min(2),
  username: z.string().trim().min(3),
  password: z.string().min(6).optional(),
});

export const createLandingSchema = z.object({
  url: z.string().trim().url(),
  metaPixelId: z.string().trim().min(1),
  metaAccessToken: z.string().trim().min(1),
});

export const updateLandingSchema = z.object({
  url: z.string().trim().url(),
  metaPixelId: z.string().trim().min(1),
  metaAccessToken: z.string().trim().min(1).optional(),
});

export const replaceCashierLandingsSchema = z.object({
  landingIds: z.array(z.string().trim().min(1)),
});

export const updateAdminAccountSchema = z
  .object({
    username: z.string().trim().min(3).optional(),
    password: z.string().min(6).optional(),
  })
  .refine((value) => Boolean(value.username || value.password), {
    message: 'At least one field is required',
  });

export type UpdateAdminAccountInput = z.infer<typeof updateAdminAccountSchema>;

export const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cashierId: z.string().optional(),
});

export const leadsFilterSchema = z.object({
  status: z.enum(['NOT_CONTACTED', 'CONTACTED', 'CONVERTED']).optional(),
  cashierId: z.string().optional(),
  adCode: z.string().trim().min(1).optional(),
});

export type DateRangeQuery = z.infer<typeof dateRangeSchema>;
export type LeadsFilterQuery = z.infer<typeof leadsFilterSchema>;
