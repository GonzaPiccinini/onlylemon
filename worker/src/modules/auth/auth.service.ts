import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';
import { hashPassword, isPasswordValid } from '../../utils/password.js';
import {
  countSuperAdmins,
  createSuperAdmin,
  findUserById,
  findUserByUsername,
  SetupConflictError,
} from './auth.repository.js';
import type { LoginPayload, SetupPayload } from './auth.types.js';
import type { AuthenticatedUser, Role } from '../../types/api.js';

// Re-export SetupConflictError so controllers can catch it
export { SetupConflictError };

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

const toRole = (value: string): Role =>
  value === 'ADMIN' ? 'ADMIN' : value === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'CASHIER';

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

  if (user.role === 'CASHIER' && user.cashier?.status === 'DISABLED') {
    return null;
  }

  if (
    (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') &&
    user.admin?.status === 'DISABLED'
  ) {
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

// ---------------------------------------------------------------------------
// Setup flow
// ---------------------------------------------------------------------------

export const getSetupStatus = async (): Promise<{ needsSetup: boolean }> => ({
  needsSetup: (await countSuperAdmins()) === 0,
});

export const runSetup = async (input: SetupPayload) => {
  const { name, username, password } = input;

  // Pre-check (fast path) before entering the Serializable transaction
  if ((await countSuperAdmins()) > 0) {
    throw new SetupConflictError();
  }

  const user = await createSuperAdmin({
    name,
    username,
    hashedPassword: hashPassword(password),
  });

  const authUser: AuthenticatedUser = { userId: user.id, role: 'SUPER_ADMIN' };
  const token = jwt.sign(authUser, config.JWT_SECRET, { expiresIn: '12h' });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: 'SUPER_ADMIN' as const,
    },
  };
};
