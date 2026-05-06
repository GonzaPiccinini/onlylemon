import { prisma } from '../../persistence/prisma/client.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const listCashiers = () =>
  prisma.cashier.findMany({
    include: {
      user: true,
      landings: {
        include: {
          landing: true,
        },
      },
      activity: {
        where: { endedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
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
        sessionName: null,
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
  input: { name: string; username: string; password?: string },
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
        ...(input.password ? { password: input.password } : {}),
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

export const enableCashier = (cashierId: string) =>
  prisma.cashier.update({
    where: { id: cashierId },
    data: {
      status: 'ACTIVE',
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

export const getCashierById = (cashierId: string) =>
  prisma.cashier.findUnique({
    where: { id: cashierId },
    select: {
      id: true,
      sessionName: true,
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
        lt: to,
      },
      ...(cashierId ? { cashierId } : {}),
    },
    include: {
      cashier: {
        include: {
          user: true,
        },
      },
    },
  });

export const getLeadsByDateRange = (
  from: Date,
  to: Date,
  cashierId?: string,
) =>
  prisma.lead.findMany({
    where: {
      createdAt: {
        gte: from,
        lt: to,
      },
      ...(cashierId ? { cashierId } : {}),
    },
    include: {
      cashier: {
        include: {
          user: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

// NOTE: Lead.convertedAt and Lead.amount were removed in meta-conversions-refactor migration.
// getConvertedLeadsByConvertedAtRange is now a stub returning empty array.
// getFundsSeriesService (admin.service.ts) will be replaced in M2 with Conversion-based query.
export const getConvertedLeadsByConvertedAtRange = (
  _from: Date,
  _to: Date,
  _cashierId?: string,
): Promise<{ id: string; createdAt: Date }[]> => Promise.resolve([]);

export const listLandings = () =>
  prisma.landing.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  });

export const listActiveLandingUrls = () =>
  prisma.landing.findMany({
    where: {
      status: 'ACTIVE',
    },
    select: {
      url: true,
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

export const getLandingByMetaPixelId = (metaPixelId: string) =>
  prisma.landing.findUnique({
    where: {
      metaPixelId,
    },
  });

export const listLeads = (filters: {
  status?: 'NOT_CONTACTED' | 'CONTACTED' | 'CONVERTED';
  cashierId?: string;
  cashierIds?: string[];
  adCode?: string;
  code?: string;
  phone?: string;
}) =>
  prisma.lead.findMany(buildListLeadsQuery(filters));

export const buildListLeadsQuery = (filters: {
  status?: 'NOT_CONTACTED' | 'CONTACTED' | 'CONVERTED';
  cashierId?: string;
  cashierIds?: string[];
  adCode?: string;
  code?: string;
  phone?: string;
}) =>
  ({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.cashierId ? { cashierId: filters.cashierId } : {}),
      ...(filters.cashierIds?.length ? { cashierId: { in: filters.cashierIds } } : {}),
      ...(filters.adCode
        ? {
            adCode: {
              contains: filters.adCode,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(filters.code ? { code: { contains: filters.code } } : {}),
      ...(filters.phone ? { phone: { contains: filters.phone } } : {}),
    },
    include: {
      cashier: {
        include: {
          user: true,
        },
      },
      conversions: {
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' as const },
        take: 1,
      },
    },
    orderBy: {
      updateAt: 'desc' as const,
    },
  }) satisfies Prisma.LeadFindManyArgs;

// ---------------------------------------------------------------------------
// M2.5 — Conversion admin queries
// ---------------------------------------------------------------------------

type ConversionsAdminFilters = {
  dateFrom?: Date;
  dateTo?: Date;
  amountMin?: number;
  amountMax?: number;
  phone?: string;
  code?: string;
  cashierIds?: string[];
};

export const buildListConversionsQuery = (filters: ConversionsAdminFilters) => {
  const leadWhere: Record<string, unknown> = {};
  if (filters.phone) leadWhere.phone = { contains: filters.phone };
  if (filters.code) leadWhere.code = { contains: filters.code };
  if (filters.cashierIds?.length) leadWhere.cashierId = { in: filters.cashierIds };

  const createdAtFilter: Record<string, Date> = {};
  if (filters.dateFrom) createdAtFilter.gte = filters.dateFrom;
  if (filters.dateTo) createdAtFilter.lt = filters.dateTo;

  const amountFilter: Record<string, number> = {};
  if (filters.amountMin !== undefined) amountFilter.gte = filters.amountMin;
  if (filters.amountMax !== undefined) amountFilter.lte = filters.amountMax;

  return {
    where: {
      ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
      ...(Object.keys(amountFilter).length ? { amount: amountFilter } : {}),
      ...(Object.keys(leadWhere).length ? { lead: leadWhere } : {}),
    },
    orderBy: { createdAt: 'desc' as const },
    include: {
      lead: {
        include: {
          cashier: {
            include: { user: true },
          },
        },
      },
    },
  };
};

export const listConversionsAdmin = (
  filters: ConversionsAdminFilters,
  page: number,
  pageSize: number,
) => {
  const q = buildListConversionsQuery(filters);
  const skip = (page - 1) * pageSize;
  return Promise.all([
    prisma.conversion.findMany({ ...q, skip, take: pageSize }),
    prisma.conversion.count({ where: q.where }),
  ]);
};

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

export const updateAdminAccount = (
  userId: string,
  input: { username?: string; password?: string },
) =>
  prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.username ? { username: input.username } : {}),
      ...(input.password ? { password: input.password } : {}),
    },
    select: { id: true, username: true, name: true },
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
