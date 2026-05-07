import { z } from 'zod';
import type { Role } from '../../types/api.js';

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
  statuses: z
    .array(z.enum(['NOT_CONTACTED', 'CONTACTED', 'CONVERTED']))
    .optional(),
  cashierId: z.string().optional(),
  cashierIds: z.array(z.string()).optional(),
  adCode: z.string().trim().min(1).optional(),
  code: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
});

export type DateRangeQuery = z.infer<typeof dateRangeSchema>;
export type LeadsFilterQuery = z.infer<typeof leadsFilterSchema>;

export const conversionsFilterSchema = z.object({
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  phone: z.string().trim().min(1).optional(),
  code: z.string().trim().min(1).optional(),
  adCode: z.string().trim().min(1).optional(),
  cashierIds: z.string().optional(), // comma-separated CSV; parsed in controller
  amountMin: z.coerce.number().optional(),
  amountMax: z.coerce.number().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type ConversionsFilterQuery = z.infer<typeof conversionsFilterSchema>;

const isValidCalendarDate = (s: string): boolean => {
  const d = new Date(`${s}T03:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  // Re-format as YYYY-MM-DD and compare: catches rolled-over dates like '2026-02-30'
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}` === s;
};

export const leadHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isValidCalendarDate, { message: 'Invalid date' })
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isValidCalendarDate, { message: 'Invalid date' })
    .optional(),
});

export type LeadHistoryQuery = z.infer<typeof leadHistoryQuerySchema>;

// ---------------------------------------------------------------------------
// Admin management schemas
// ---------------------------------------------------------------------------

export const createAdminSchema = z.object({
  name: z.string().trim().min(2),
  username: z.string().trim().min(3),
  password: z.string().min(8),
});

export type CreateAdminInput = z.infer<typeof createAdminSchema>;

export const updateAdminSchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    username: z.string().trim().min(3).optional(),
    password: z.string().min(8).optional(),
  })
  .refine((value) => Boolean(value.name || value.username || value.password), {
    message: 'At least one field is required',
  });

export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;

export const setAdminStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'DISABLED']),
});

export type SetAdminStatusInput = z.infer<typeof setAdminStatusSchema>;

export interface AdminListItem {
  id: string;
  userId: string;
  name: string;
  username: string;
  role: Extract<Role, 'ADMIN' | 'SUPER_ADMIN'>;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// admin-conversions-totals — M1
// ---------------------------------------------------------------------------

export const conversionsTotalsFilterSchema = conversionsFilterSchema.omit({
  page: true,
  pageSize: true,
});

export type ConversionsTotalsFilters = z.infer<typeof conversionsTotalsFilterSchema>;

export interface ConversionsTotalsDto {
  totalAmount: number;
  count: number;
  averageAmount: number;
}
