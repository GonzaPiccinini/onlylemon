import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export type LoginPayload = z.infer<typeof loginSchema>;

export const setupSchema = z.object({
  name: z.string().trim().min(2),
  username: z.string().trim().min(3),
  password: z.string().min(8),
});

export type SetupPayload = z.infer<typeof setupSchema>;

export interface SetupResponse {
  token: string;
  user: {
    id: string;
    name: string;
    username: string;
    role: 'SUPER_ADMIN';
  };
}
