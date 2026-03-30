import { z } from 'zod';

export const createUserArgsSchema = z.object({
  name: z.string().min(1).max(120),
});

export const depositMoneyArgsSchema = z.object({
  name: z.string().min(1).max(120),
  amount: z.number().int().positive().min(2000).max(1_000_000_000),
});

export type CreateUserArgs = z.infer<typeof createUserArgsSchema>;
export type DepositMoneyArgs = z.infer<typeof depositMoneyArgsSchema>;
