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

// ---------------------------------------------------------------------------
// LandingFallbackPhone — Zod schemas (B6.2)
// ---------------------------------------------------------------------------

const PHONE_REGEX = /^\+?[0-9]{8,15}$/;

export const createLandingFallbackPhoneSchema = z.object({
  phone: z.string().regex(PHONE_REGEX, 'Invalid phone format (8–15 digits, optional + prefix)'),
  label: z.string().trim().optional(),
  order: z.number().int().optional(),
});

export const updateLandingFallbackPhoneSchema = z
  .object({
    phone: z.string().regex(PHONE_REGEX, 'Invalid phone format (8–15 digits, optional + prefix)').optional(),
    label: z.string().trim().nullable().optional(),
    order: z.number().int().nullable().optional(),
  })
  .refine((value) => value.phone !== undefined || value.label !== undefined || value.order !== undefined, {
    message: 'At least one field is required',
  });

const fallbackPhoneItemSchema = z.object({
  phone: z.string().regex(PHONE_REGEX, 'Invalid phone format (8–15 digits, optional + prefix)'),
  label: z.string().trim().optional(),
  order: z.number().int().optional(),
});

/**
 * Task 3.6 — whatsappMessages validation schema (reusable).
 * Each message is trimmed; empty/whitespace-only entries are discarded;
 * max 5 messages after discarding empties; each ≤250 chars.
 */
const whatsappMessagesSchema = z
  .array(z.string())
  .transform((msgs) => msgs.map((m) => m.trim()).filter((m) => m.length > 0))
  .superRefine((msgs, ctx) => {
    if (msgs.length > 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: 5,
        origin: 'array',
        inclusive: true,
        message: 'Maximum 5 whatsapp messages per landing',
      });
    }
    for (const msg of msgs) {
      if (msg.length > 250) {
        ctx.addIssue({
          code: z.ZodIssueCode.too_big,
          maximum: 250,
          origin: 'string',
          inclusive: true,
          message: `Message exceeds 250 characters (got ${msg.length})`,
        });
      }
    }
  });

/**
 * Phase 5 (Contract) — createLandingSchema uses MetaPixel FK selector.
 * `metaPixelId` (FK → MetaPixel.id) is the final column name after Contract migration.
 * `whatsappMessages` is optional (validated: trim, discard empty, max 5, max 250 chars each).
 * Declared AFTER whatsappMessagesSchema to avoid temporal dead zone errors.
 */
export const createLandingSchema = z.object({
  url: z.string().trim().url(),
  /** FK → MetaPixel.id (UUID). Required for create. */
  metaPixelId: z.string().trim().min(1, 'metaPixelId (MetaPixel FK UUID) is required'),
  fallbackPhones: z.array(fallbackPhoneItemSchema).min(1, 'At least one fallback phone is required'),
  whatsappMessages: whatsappMessagesSchema.optional(),
});

/**
 * Phase 5 (Contract) — updateLandingSchema.
 * Old scalar fields (metaPixelId pixel number + metaAccessToken) are gone.
 * metaPixelId is now the FK UUID → MetaPixel.id.
 */
export const updateLandingSchema = z.object({
  url: z.string().trim().url(),
  /** FK → MetaPixel.id (UUID). Optional for update (partial update). */
  metaPixelId: z.string().trim().min(1).optional(),
  /** Per-landing WhatsApp messages (task 3.6). Validated: trim, discard empty, max 5, max 250 chars each. */
  whatsappMessages: whatsappMessagesSchema.optional(),
  fallbackPhones: z.array(fallbackPhoneItemSchema).min(1, 'At least one fallback phone is required').optional(),
});

// ---------------------------------------------------------------------------
// 3.4 — MetaPixel Zod schemas
// ---------------------------------------------------------------------------

export const createMetaPixelSchema = z.object({
  pixelId: z.string().trim().min(1, 'pixelId is required'),
  accessToken: z.string().trim().min(1, 'accessToken is required'),
  label: z.string().trim().optional(),
});

export type CreateMetaPixelInput = z.infer<typeof createMetaPixelSchema>;

export const updateMetaPixelSchema = z
  .object({
    pixelId: z.string().trim().min(1).optional(),
    accessToken: z.string().trim().min(1).optional(),
    label: z.string().trim().nullable().optional(),
  })
  .refine(
    (v) => v.pixelId !== undefined || v.accessToken !== undefined || v.label !== undefined,
    { message: 'At least one field (pixelId, accessToken, or label) is required' },
  );

export type UpdateMetaPixelInput = z.infer<typeof updateMetaPixelSchema>;

// ---------------------------------------------------------------------------
// WhatsappSession admin schemas (E2, E6)
// ---------------------------------------------------------------------------

export const updateCashierMaxSessionsSchema = z.object({
  maxSessions: z.number().int().min(1),
});

export type UpdateCashierMaxSessionsInput = z.infer<typeof updateCashierMaxSessionsSchema>;

export const replaceSessionLandingsSchema = z.object({
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
    .array(z.enum(['NOT_CONTACTED', 'CONTACTED', 'CONVERTED', 'RECARGA']))
    .optional(),
  cashierId: z.string().optional(),
  cashierIds: z.array(z.string()).optional(),
  adCode: z.string().trim().min(1).optional(),
  code: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
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

// ---------------------------------------------------------------------------
// LandingFallbackPhone — B2.2
// ---------------------------------------------------------------------------

export interface LandingFallbackPhoneDto {
  id: string;
  landingId: string;
  phone: string;
  label: string | null;
  order: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLandingFallbackPhoneInput {
  landingId: string;
  phone: string;
  label?: string;
  order?: number;
}

export interface UpdateLandingFallbackPhoneInput {
  phone?: string;
  label?: string | null;
  order?: number | null;
}
