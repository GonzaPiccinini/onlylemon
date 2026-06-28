import { prisma } from '../../persistence/prisma/client.js';

// ---------------------------------------------------------------------------
// Typed error classes for setup flow
// ---------------------------------------------------------------------------

export class SetupConflictError extends Error {
  constructor() {
    super('SUPER_ADMIN already exists');
    this.name = 'SetupConflictError';
  }
}

// ---------------------------------------------------------------------------
// Typed error classes for refresh token flow (B2.4)
// ---------------------------------------------------------------------------

export class RefreshReuseError extends Error {
  constructor() {
    super('Refresh token reuse detected');
    this.name = 'RefreshReuseError';
  }
}

export class RefreshExpiredError extends Error {
  constructor() {
    super('Refresh token expired');
    this.name = 'RefreshExpiredError';
  }
}

export class RefreshInvalidError extends Error {
  constructor() {
    super('Refresh token invalid');
    this.name = 'RefreshInvalidError';
  }
}

export const findUserByUsername = async (username: string) =>
  prisma.user.findUnique({
    where: { username },
    include: {
      cashier: true,
      admin: true,
    },
  });

export const findUserById = async (id: string) =>
  prisma.user.findUnique({
    where: { id },
    include: {
      cashier: true,
      admin: true,
    },
  });

export const updateUserPassword = (
  userId: string,
  hashedPassword: string,
): Promise<void> =>
  prisma.user
    .update({ where: { id: userId }, data: { password: hashedPassword } })
    .then(() => undefined);

export const findCashierStatusByUserId = async (userId: string) => {
  const cashier = await prisma.cashier.findUnique({
    where: { userId },
    select: {
      status: true,
    },
  });

  return cashier?.status ?? null;
};

// ---------------------------------------------------------------------------
// Setup flow helpers
// ---------------------------------------------------------------------------

type PrismaTx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export const countSuperAdmins = (): Promise<number> =>
  prisma.user.count({ where: { role: 'SUPER_ADMIN' } });

export const createSuperAdmin = async (
  input: {
    name: string;
    username: string;
    hashedPassword: string;
  },
  tx?: PrismaTx,
): Promise<{ id: string; name: string; username: string; role: 'SUPER_ADMIN' }> => {
  const run = async (client: PrismaTx) => {
    // RECHECK inside the transaction (race-safe with Serializable isolation)
    const existing = await client.user.count({ where: { role: 'SUPER_ADMIN' } });
    if (existing > 0) {
      throw new SetupConflictError();
    }

    const user = await client.user.create({
      data: {
        name: input.name,
        username: input.username,
        password: input.hashedPassword,
        role: 'SUPER_ADMIN',
      },
      select: { id: true, name: true, username: true, role: true },
    });

    await client.admin.create({
      data: { userId: user.id },
    });

    return { id: user.id, name: user.name, username: user.username, role: user.role as 'SUPER_ADMIN' };
  };

  if (tx) {
    return run(tx);
  }
  return prisma.$transaction(run, { isolationLevel: 'Serializable' });
};

export const findAdminStatusByUserId = async (userId: string) => {
  const admin = await prisma.admin.findUnique({
    where: { userId },
    select: {
      status: true,
    },
  });

  return admin?.status ?? null;
};

// ---------------------------------------------------------------------------
// Refresh token repository functions (B2.4)
// ---------------------------------------------------------------------------

export const createRefreshToken = (
  input: { token: string; userId: string; expiresAt: Date },
  tx?: PrismaTx,
): Promise<void> =>
  (tx ?? prisma).refreshToken.create({ data: input }).then(() => undefined);

export const findRefreshToken = (
  token: string,
): Promise<{ id: string; userId: string; expiresAt: Date } | null> =>
  prisma.refreshToken.findUnique({
    where: { token },
    select: { id: true, userId: true, expiresAt: true },
  });

export const deleteRefreshToken = (token: string, tx?: PrismaTx): Promise<void> =>
  (tx ?? prisma).refreshToken
    .delete({ where: { token } })
    .then(() => undefined)
    .catch(() => undefined);

export const deleteAllRefreshTokensByUserId = (userId: string): Promise<void> =>
  prisma.refreshToken.deleteMany({ where: { userId } }).then(() => undefined);
