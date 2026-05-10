import { z } from 'zod';
import type { Role } from '../../types/api.js';

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

// ---------------------------------------------------------------------------
// Refresh token schemas (B2.2)
// ---------------------------------------------------------------------------

export const refreshSchema = z.object({ refreshToken: z.string().min(1) });
export const logoutSchema = z.object({ refreshToken: z.string().min(1) });

export type RefreshPayload = z.infer<typeof refreshSchema>;
export type LogoutPayload = z.infer<typeof logoutSchema>;

export interface RefreshTokenJwtPayload {
  userId: string;
  jti: string;
}

export type PublicUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  cashierId?: string;
  sessionName?: string | null;
};

export interface AuthSessionResponse {
  token: string;
  refreshToken: string;
  expiresIn: number;
  user: PublicUser;
}
