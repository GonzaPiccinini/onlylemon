import { prisma } from '../../persistence/prisma/client.js';

export const listCashiers = () =>
  prisma.cashier.findMany({
    include: {
      user: true,
      landings: {
        include: {
          landing: true,
        },
      },
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
        sessionName: `cashier-${user.username}`,
      },
      include: {
        user: true,
        landings: {
          include: {
            landing: true,
          },
        },
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
        landings: {
          include: {
            landing: true,
          },
        },
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
      landings: {
        include: {
          landing: true,
        },
      },
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
      ...(cashierId ? { cashierId } : {}),
    },
    include: {
      cashier: {
        include: {
          user: true,
          chat: {
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
        ...(cashierId ? { cashierId } : {}),
      },
    },
    include: {
      chat: {
        include: {
          cashier: {
            include: {
              user: true,
              landings: {
                include: {
                  landing: true,
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

export const listLandings = () =>
  prisma.landing.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  });

export const createLanding = (input: {
  url: string;
  metaPixelId: string;
  metaAccessToken: string;
}) =>
  prisma.landing.create({
    data: input,
  });

export const updateLanding = (
  landingId: string,
  input: {
    url: string;
    metaPixelId: string;
    metaAccessToken?: string;
  },
) =>
  prisma.landing.update({
    where: { id: landingId },
    data: {
      url: input.url,
      metaPixelId: input.metaPixelId,
      ...(input.metaAccessToken ? { metaAccessToken: input.metaAccessToken } : {}),
    },
  });

export const setLandingStatus = (
  landingId: string,
  status: 'ACTIVE' | 'DISABLED',
) =>
  prisma.landing.update({
    where: { id: landingId },
    data: { status },
  });

export const getCashierLandings = (cashierId: string) =>
  prisma.cashierLanding.findMany({
    where: {
      cashierId,
    },
    include: {
      landing: true,
    },
  });

export const replaceCashierLandings = async (
  cashierId: string,
  landingIds: string[],
) =>
  prisma.$transaction(async (tx) => {
    await tx.cashier.findUniqueOrThrow({
      where: { id: cashierId },
    });

    if (landingIds.length > 0) {
      const existing = await tx.landing.findMany({
        where: {
          id: {
            in: landingIds,
          },
        },
        select: {
          id: true,
        },
      });

      if (existing.length !== new Set(landingIds).size) {
        throw new Error('Some landingIds do not exist');
      }
    }

    await tx.cashierLanding.deleteMany({
      where: {
        cashierId,
      },
    });

    if (landingIds.length > 0) {
      await tx.cashierLanding.createMany({
        data: landingIds.map((landingId) => ({
          cashierId,
          landingId,
        })),
      });
    }

    return tx.cashierLanding.findMany({
      where: {
        cashierId,
      },
      include: {
        landing: true,
      },
    });
  });
