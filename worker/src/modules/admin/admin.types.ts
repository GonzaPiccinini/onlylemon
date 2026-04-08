import { z } from 'zod';

export const createCashierSchema = z.object({
  name: z.string().trim().min(2),
  username: z.string().trim().min(3),
  password: z.string().min(6),
});

export const updateCashierSchema = z.object({
  name: z.string().trim().min(2),
  username: z.string().trim().min(3),
});

export const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cashierId: z.string().optional(),
});

export type DateRangeQuery = z.infer<typeof dateRangeSchema>;
