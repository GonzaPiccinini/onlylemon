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

const leadStatusSchema = z.enum([
  'NOT_CONTACTED',
  'CONTACTED',
  'CONVERTED',
  'EXPIRED',
]);

const parseMultiQueryValue = (value: unknown): string[] | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item).split(','))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export const leadsFilterSchema = z.object({
  status: z.preprocess(
    parseMultiQueryValue,
    z.array(leadStatusSchema).min(1).optional(),
  ),
  cashierId: z.preprocess(
    parseMultiQueryValue,
    z.array(z.string().trim().min(1)).min(1).optional(),
  ),
  adCode: z.string().trim().min(1).optional(),
});

export type DateRangeQuery = z.infer<typeof dateRangeSchema>;
export type LeadsFilterQuery = z.infer<typeof leadsFilterSchema>;
