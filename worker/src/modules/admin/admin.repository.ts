import { prisma } from '../../persistence/prisma/client.js';

export const listCashiers = () =>
  prisma.cashier.findMany({
    include: {
      user: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

export const createCashier = async (input: {
  name: string;
  username: string;
  password: string;
}) =>
  prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        username: input.username,
        password: input.password,
        role: 'CASHIER',
      },
    });

    return tx.cashier.create({
      data: {
        userId: user.id,
      },
      include: {
        user: true,
      },
    });
  });

export const updateCashier = async (
  cashierId: string,
  input: { name: string; username: string },
) =>
  prisma.$transaction(async (tx) => {
    const cashier = await tx.cashier.findUnique({ where: { id: cashierId } });
    if (!cashier) {
      return null;
    }

    await tx.user.update({
      where: { id: cashier.userId },
      data: {
        name: input.name,
        username: input.username,
      },
    });

    return tx.cashier.findUnique({
      where: { id: cashierId },
      include: {
        user: true,
      },
    });
  });

export const disableCashier = (cashierId: string) =>
  prisma.cashier.update({
    where: { id: cashierId },
    data: {
      status: 'DISABLED',
    },
    include: {
      user: true,
    },
  });

export const getCashierByUserId = (userId: string) =>
  prisma.cashier.findUnique({
    where: { userId },
    include: {
      user: true,
    },
  });

export const getSessionActivitiesByDateRange = (
  from: Date,
  to: Date,
  cashierId?: string,
) =>
  prisma.sessionActivity.findMany({
    where: {
      createdAt: {
        gte: from,
        lte: to,
      },
      session: {
        ...(cashierId ? { cashierId } : {}),
      },
    },
    include: {
      session: {
        include: {
          cashier: {
            include: {
              user: true,
            },
          },
          chats: {
            include: {
              addedFunds: true,
            },
          },
        },
      },
    },
  });

export const getAddFundsByDateRange = (
  from: Date,
  to: Date,
  cashierId?: string,
) =>
  prisma.addFunds.findMany({
    where: {
      createdAt: {
        gte: from,
        lte: to,
      },
      chat: {
        session: {
          ...(cashierId ? { cashierId } : {}),
        },
      },
    },
    include: {
      chat: {
        include: {
          session: {
            include: {
              cashier: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
