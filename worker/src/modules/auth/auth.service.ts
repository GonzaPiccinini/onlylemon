import jwt from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { config, parseDurationToMs } from '../../config/env.js';
import { prisma } from '../../persistence/prisma/client.js';
import { hashPassword, isPasswordValid } from '../../utils/password.js';
import {
  countSuperAdmins,
  createSuperAdmin,
  findUserById,
  findUserByUsername,
  SetupConflictError,
  createRefreshToken,
  deleteRefreshToken,
  deleteAllRefreshTokensByUserId,
  findRefreshToken,
  RefreshReuseError,
  RefreshExpiredError,
  RefreshInvalidError,
} from './auth.repository.js';
import type { LoginPayload, SetupPayload, AuthSessionResponse, PublicUser, RefreshTokenJwtPayload } from './auth.types.js';
import type { AuthenticatedUser, Role } from '../../types/api.js';

// Re-export errors so controllers can catch them
export { SetupConflictError, RefreshReuseError, RefreshExpiredError, RefreshInvalidError };

const toRole = (value: string): Role =>
  value === 'ADMIN' ? 'ADMIN' : value === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'CASHIER';

const toPublicUser = (
  user: Awaited<ReturnType<typeof findUserById>>,
): PublicUser | null => {
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
        }
      : {}),
  };
};

// ---------------------------------------------------------------------------
// Private JWT signing helpers
// ---------------------------------------------------------------------------

const signAccessToken = (authUser: AuthenticatedUser): string =>
  jwt.sign(authUser, config.JWT_SECRET, { expiresIn: config.JWT_ACCESS_EXPIRES as StringValue });

const signRefreshToken = (payload: RefreshTokenJwtPayload): string =>
  jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: `${config.JWT_REFRESH_EXPIRES_DAYS}d` as StringValue,
  });

const getExpiresIn = (): number =>
  Math.round(parseDurationToMs(config.JWT_ACCESS_EXPIRES) / 1000);

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export const login = async (payload: LoginPayload): Promise<AuthSessionResponse | null> => {
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

  const publicUser = toPublicUser(user);
  if (!publicUser) {
    return null;
  }

  const authUser: AuthenticatedUser = {
    userId: user.id,
    role: toRole(user.role),
    ...(user.cashier ? { cashierId: user.cashier.id } : {}),
  };

  const token = signAccessToken(authUser);
  const jti = globalThis.crypto.randomUUID();
  const refreshTokenStr = signRefreshToken({ userId: user.id, jti });
  const expiresAt = new Date(Date.now() + config.JWT_REFRESH_EXPIRES_DAYS * 24 * 3_600_000);
  const expiresIn = getExpiresIn();

  await createRefreshToken({ token: refreshTokenStr, userId: user.id, expiresAt });

  return {
    token,
    refreshToken: refreshTokenStr,
    expiresIn,
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

export const runSetup = async (input: SetupPayload): Promise<AuthSessionResponse> => {
  const { name, username, password } = input;

  // Pre-check (fast path) before entering the Serializable transaction
  if ((await countSuperAdmins()) > 0) {
    throw new SetupConflictError();
  }

  const jti = globalThis.crypto.randomUUID();
  const expiresAt = new Date(Date.now() + config.JWT_REFRESH_EXPIRES_DAYS * 24 * 3_600_000);

  // Atomic block: SUPER_ADMIN + Admin row + RefreshToken row in ONE Serializable tx
  const { user, refreshTokenStr } = await prisma.$transaction(
    async (tx) => {
      const created = await createSuperAdmin(
        { name, username, hashedPassword: hashPassword(password) },
        tx,
      );
      const refreshTokenStrLocal = signRefreshToken({ userId: created.id, jti });
      await createRefreshToken(
        { token: refreshTokenStrLocal, userId: created.id, expiresAt },
        tx,
      );
      return { user: created, refreshTokenStr: refreshTokenStrLocal };
    },
    { isolationLevel: 'Serializable' },
  );

  // Outside the tx: pure CPU (sign + assemble response)
  const authUser: AuthenticatedUser = { userId: user.id, role: 'SUPER_ADMIN' };
  const token = signAccessToken(authUser);
  const expiresIn = getExpiresIn();

  return {
    token,
    refreshToken: refreshTokenStr,
    expiresIn,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: 'SUPER_ADMIN' as const,
    },
  };
};

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

export const refresh = async (
  refreshToken: string,
): Promise<{ token: string; refreshToken: string; expiresIn: number }> => {
  // Step 1: Verify JWT signature
  let payload: RefreshTokenJwtPayload;
  try {
    payload = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET) as RefreshTokenJwtPayload;
  } catch {
    throw new RefreshInvalidError();
  }

  // Step 2: Look up the token in the DB
  const row = await findRefreshToken(refreshToken);

  if (row === null) {
    // Reuse detected: the token was already used (deleted) or never existed
    await deleteAllRefreshTokensByUserId(payload.userId);
    throw new RefreshReuseError();
  }

  // Step 3: Check expiry
  if (row.expiresAt < new Date()) {
    await deleteRefreshToken(refreshToken);
    throw new RefreshExpiredError();
  }

  // Step 4: Rotate — delete old, create new (in a transaction)
  const newJti = globalThis.crypto.randomUUID();
  const newExpiresAt = new Date(Date.now() + config.JWT_REFRESH_EXPIRES_DAYS * 24 * 3_600_000);

  // Fetch the user's current role for the new access token
  const user = await findUserById(row.userId);
  if (!user) {
    throw new RefreshInvalidError();
  }

  const authUser: AuthenticatedUser = {
    userId: user.id,
    role: toRole(user.role),
    ...(user.cashier ? { cashierId: user.cashier.id } : {}),
  };

  const newToken = signAccessToken(authUser);
  const newRefreshToken = signRefreshToken({ userId: row.userId, jti: newJti });
  const expiresIn = getExpiresIn();

  // Atomic rotation
  await prisma.$transaction(async (tx) => {
    await deleteRefreshToken(refreshToken, tx);
    await createRefreshToken({ token: newRefreshToken, userId: row.userId, expiresAt: newExpiresAt }, tx);
  });

  return { token: newToken, refreshToken: newRefreshToken, expiresIn };
};

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export const logout = async (refreshToken: string): Promise<void> => {
  await deleteRefreshToken(refreshToken);
};
