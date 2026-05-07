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

export const countSuperAdmins = (): Promise<number> =>
  prisma.user.count({ where: { role: 'SUPER_ADMIN' } });

export const createSuperAdmin = async (input: {
  name: string;
  username: string;
  hashedPassword: string;
}) =>
  prisma.$transaction(
    async (tx) => {
      // RECHECK inside the transaction (race-safe with Serializable isolation)
      const existing = await tx.user.count({ where: { role: 'SUPER_ADMIN' } });
      if (existing > 0) {
        throw new SetupConflictError();
      }

      const user = await tx.user.create({
        data: {
          name: input.name,
          username: input.username,
          password: input.hashedPassword,
          role: 'SUPER_ADMIN',
        },
        select: { id: true, name: true, username: true, role: true },
      });

      await tx.admin.create({
        data: { userId: user.id },
      });

      return { id: user.id, name: user.name, username: user.username, role: user.role as 'SUPER_ADMIN' };
    },
    { isolationLevel: 'Serializable' },
  );

export const findAdminStatusByUserId = async (userId: string) => {
  const admin = await prisma.admin.findUnique({
    where: { userId },
    select: {
      status: true,
    },
  });

  return admin?.status ?? null;
};
