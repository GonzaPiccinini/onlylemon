import { prisma } from '../../persistence/prisma/client.js';

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
