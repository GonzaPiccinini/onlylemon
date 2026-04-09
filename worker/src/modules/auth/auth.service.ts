import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';
import { isPasswordValid } from '../../utils/password.js';
import { findUserById, findUserByUsername } from './auth.repository.js';
import type { LoginPayload } from './auth.types.js';
import type { AuthenticatedUser, Role } from '../../types/api.js';

interface LoginResult {
  token: string;
  user: {
    id: string;
    name: string;
    username: string;
    role: Role;
    cashierId?: string;
    sessionName?: string | null;
  };
}

const toRole = (value: string): Role => (value === 'ADMIN' ? 'ADMIN' : 'CASHIER');

const toPublicUser = (
  user: Awaited<ReturnType<typeof findUserById>>,
): LoginResult['user'] | null => {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: toRole(user.role),
    ...(user.cashier
      ? {
          cashierId: user.cashier.id,
          sessionName: user.cashier.sessionName,
        }
      : {}),
  };
};

export const login = async (payload: LoginPayload): Promise<LoginResult | null> => {
  const user = await findUserByUsername(payload.username);
  if (!user) {
    return null;
  }

  if (!isPasswordValid(payload.password, user.password)) {
    return null;
  }

  const authUser: AuthenticatedUser = {
    userId: user.id,
    role: toRole(user.role),
    ...(user.cashier ? { cashierId: user.cashier.id } : {}),
  };

  const token = jwt.sign(authUser, config.JWT_SECRET, { expiresIn: '12h' });
  const publicUser = toPublicUser(user);

  if (!publicUser) {
    return null;
  }

  return {
    token,
    user: publicUser,
  };
};

export const getMe = async (authUser: AuthenticatedUser) => {
  const user = await findUserById(authUser.userId);
  return toPublicUser(user);
};
