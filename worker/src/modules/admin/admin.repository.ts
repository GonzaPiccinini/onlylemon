import { prisma } from '../../persistence/prisma/client.js';
import { Prisma } from '../../generated/prisma/client.js';

export const listCashiers = () =>
  prisma.cashier.findMany({
    include: {
      user: true,
      sessions: true,
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
      },
      include: {
        user: true,
        sessions: true,
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
        sessions: true,
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
      sessions: true,
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
      sessions: true,
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
      status: true,
      maxSessions: true,
      user: {
        select: {
          name: true,
          username: true,
        },
      },
      sessions: true,
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

/**
 * M3.5 — getConversionsByDateRange
 * Returns all Conversions in the date range (for getFundsSeriesService histogram).
 * Optional cashierId scopes to a specific cashier's leads.
 */
export const getConversionsByDateRange = (
  from: Date,
  to: Date,
  cashierId?: string,
) =>
  prisma.conversion.findMany({
    where: {
      createdAt: { gte: from, lt: to },
      ...(cashierId ? { lead: { cashierId } } : {}),
    },
    select: {
      createdAt: true,
      amount: true,
    },
    orderBy: { createdAt: 'asc' },
  });

/**
 * Admin stats series grouped by lead.contactedAt day.
 * Returns conversions whose lead has contactedAt in the selected date range.
 */
export const getConversionsByLeadContactedDateRange = (
  from: Date,
  to: Date,
  cashierId?: string,
) =>
  prisma.conversion.findMany({
    where: {
      lead: {
        contactedAt: { gte: from, lt: to },
        ...(cashierId ? { cashierId } : {}),
      },
    },
    select: {
      amount: true,
      lead: {
        select: {
          contactedAt: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

/**
 * Admin stats series: first-conversion-per-lead bucketed by date.
 * For every lead, finds its earliest conversion (MIN(createdAt)) and returns
 * only those whose first conversion falls within [from, to). Optional
 * cashierId scopes to a specific cashier's leads.
 *
 * Returns rows shaped for groupConversionsByDay: { createdAt, amount.toNumber() }.
 * Note: $queryRaw returns amount as a string (numeric) — we wrap it with a
 * toNumber() shim so consumers don't need to know the source.
 */
export const getFirstConversionsByDateRange = async (
  from: Date,
  to: Date,
  cashierId?: string,
): Promise<Array<{ createdAt: Date; amount: { toNumber: () => number } }>> => {
  const rows = await prisma.$queryRaw<Array<{ createdAt: Date; amount: string | number }>>(
    cashierId
      ? Prisma.sql`
          SELECT c."createdAt", c."amount"
          FROM "Conversion" c
          INNER JOIN (
            SELECT "leadId", MIN("createdAt") AS first_at
            FROM "Conversion"
            GROUP BY "leadId"
          ) f ON f."leadId" = c."leadId" AND f.first_at = c."createdAt"
          INNER JOIN "Lead" l ON l."id" = c."leadId"
          WHERE c."createdAt" >= ${from} AND c."createdAt" < ${to}
            AND l."cashierId" = ${cashierId}
          ORDER BY c."createdAt" ASC
        `
      : Prisma.sql`
          SELECT c."createdAt", c."amount"
          FROM "Conversion" c
          INNER JOIN (
            SELECT "leadId", MIN("createdAt") AS first_at
            FROM "Conversion"
            GROUP BY "leadId"
          ) f ON f."leadId" = c."leadId" AND f.first_at = c."createdAt"
          WHERE c."createdAt" >= ${from} AND c."createdAt" < ${to}
          ORDER BY c."createdAt" ASC
        `,
  );

  return rows.map((row) => ({
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    amount: { toNumber: () => Number(row.amount) },
  }));
};

/**
 * Returns Conversions in the date range together with their lead's
 * createdAt (for averageConversionHours) and the owning cashier
 * (for per-cashier convertedValue grouping in stats services).
 */
export const getConversionsWithLeadByDateRange = (
  from: Date,
  to: Date,
  cashierId?: string,
) =>
  prisma.conversion.findMany({
    where: {
      createdAt: { gte: from, lt: to },
      ...(cashierId ? { lead: { cashierId } } : {}),
    },
    select: {
      createdAt: true,
      amount: true,
      lead: {
        select: {
          createdAt: true,
          cashierId: true,
          cashier: {
            select: {
              id: true,
              user: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

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
  statuses?: Array<'NOT_CONTACTED' | 'CONTACTED' | 'CONVERTED'>;
  cashierId?: string;
  cashierIds?: string[];
  adCode?: string;
  code?: string;
  phone?: string;
}) =>
  prisma.lead.findMany(buildListLeadsQuery(filters));

export const getConversionsAggregateForLeads = async (leadIds: string[]) => {
  if (leadIds.length === 0) {
    return new Map<string, { count: number; lastAt: Date | null }>();
  }
  const rows = await prisma.conversion.groupBy({
    by: ['leadId'],
    where: { leadId: { in: leadIds } },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  return new Map(
    rows.map((row) => [
      row.leadId,
      { count: row._count._all, lastAt: row._max.createdAt },
    ]),
  );
};

type LeadHistoryOpts = {
  page: number;
  pageSize: number;
  dateFrom?: Date;
  dateTo?: Date;
};

export const getLeadHistory = async (leadId: string, opts: LeadHistoryOpts) => {
  const skip = (opts.page - 1) * opts.pageSize;
  const createdAt: Record<string, Date> = {};
  if (opts.dateFrom) createdAt.gte = opts.dateFrom;
  if (opts.dateTo) createdAt.lt = opts.dateTo;
  const conversionWhere = {
    leadId,
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
  };

  const [lead, conversions, total, firstConversion] = await Promise.all([
    prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, createdAt: true, contactedAt: true },
    }),
    prisma.conversion.findMany({
      where: conversionWhere,
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' as const },
      skip,
      take: opts.pageSize,
    }),
    prisma.conversion.count({ where: conversionWhere }),
    prisma.conversion.findFirst({
      where: { leadId },
      orderBy: { createdAt: 'asc' as const },
      select: { createdAt: true },
    }),
  ]);

  return { lead, conversions, total, firstConversion };
};

export const buildListLeadsQuery = (filters: {
  statuses?: Array<'NOT_CONTACTED' | 'CONTACTED' | 'CONVERTED'>;
  cashierId?: string;
  cashierIds?: string[];
  adCode?: string;
  code?: string;
  phone?: string;
}) =>
  ({
    where: {
      ...(filters.statuses?.length ? { status: { in: filters.statuses } } : {}),
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
      ...(filters.code
        ? {
            code: {
              contains: filters.code,
              mode: 'insensitive' as const,
            },
          }
        : {}),
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
  adCode?: string;
  cashierIds?: string[];
};

export const buildListConversionsQuery = (filters: ConversionsAdminFilters) => {
  const leadWhere: Record<string, unknown> = {};
  if (filters.phone) leadWhere.phone = { contains: filters.phone };
  if (filters.code) leadWhere.code = { contains: filters.code, mode: 'insensitive' as const };
  if (filters.adCode) leadWhere.adCode = { contains: filters.adCode, mode: 'insensitive' as const };
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

export const getConversionsTotals = (filters: ConversionsAdminFilters) =>
  prisma.conversion.aggregate({
    where: buildListConversionsQuery(filters).where,
    _count: { _all: true },
    _sum: { amount: true },
    _avg: { amount: true },
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
  prisma.whatsappSessionLanding.findMany({
    where: {
      session: { cashierId },
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

// ---------------------------------------------------------------------------
// Admin CRUD helpers (tasks 15–18)
// ---------------------------------------------------------------------------

export const findAdminById = (adminId: string) =>
  prisma.admin.findUnique({
    where: { id: adminId },
    include: { user: { select: { id: true, name: true, username: true, role: true } } },
  });

export const listAdmins = () =>
  prisma.admin.findMany({
    include: { user: { select: { id: true, name: true, username: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  });

export const createAdmin = async (input: {
  name: string;
  username: string;
  hashedPassword: string;
}) =>
  prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        username: input.username,
        password: input.hashedPassword,
        role: 'ADMIN',
      },
    });

    return tx.admin.create({
      data: { userId: user.id },
      include: { user: { select: { id: true, name: true, username: true, role: true } } },
    });
  });

export const updateAdmin = async (
  adminId: string,
  input: { name?: string; username?: string; hashedPassword?: string },
) =>
  prisma.$transaction(async (tx) => {
    const admin = await tx.admin.findUnique({ where: { id: adminId } });
    if (!admin) return null;

    await tx.user.update({
      where: { id: admin.userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.username !== undefined ? { username: input.username } : {}),
        ...(input.hashedPassword ? { password: input.hashedPassword } : {}),
      },
    });

    return tx.admin.findUnique({
      where: { id: adminId },
      include: { user: { select: { id: true, name: true, username: true, role: true } } },
    });
  });

export const setAdminStatus = (adminId: string, status: 'ACTIVE' | 'DISABLED') =>
  prisma.admin.update({
    where: { id: adminId },
    data: { status },
    include: { user: { select: { id: true, name: true, username: true, role: true } } },
  });

// ---------------------------------------------------------------------------
// E — WhatsappSession admin repository helpers
// ---------------------------------------------------------------------------

/**
 * E6 — Update cashier maxSessions.
 */
export const updateCashierMaxSessions = async (cashierId: string, maxSessions: number) => {
  const cashier = await prisma.cashier.findUnique({ where: { id: cashierId } });
  if (!cashier) return null;
  return prisma.cashier.update({
    where: { id: cashierId },
    data: { maxSessions },
    include: {
      user: true,
      sessions: true,
    },
  });
};

/**
 * E4a — Get a session with its landing bindings.
 */
export const getSessionWithLandings = (sessionId: string) =>
  prisma.whatsappSession.findUnique({
    where: { id: sessionId },
    include: {
      landings: {
        include: {
          landing: true,
        },
      },
    },
  });

/**
 * E4b — Full-replace landings for a session.
 */
export const replaceSessionLandings = async (
  sessionId: string,
  landingIds: string[],
) =>
  prisma.$transaction(async (tx) => {
    await tx.whatsappSessionLanding.deleteMany({
      where: { sessionId },
    });
    if (landingIds.length > 0) {
      await tx.whatsappSessionLanding.createMany({
        data: landingIds.map((landingId) => ({ sessionId, landingId })),
        skipDuplicates: true,
      });
    }
    return tx.whatsappSessionLanding.findMany({
      where: { sessionId },
      include: { landing: true },
    });
  });

/**
 * E5 (landing side) — Get all sessions bound to a landing.
 */
export const getSessionsBoundToLandingId = (landingId: string) =>
  prisma.whatsappSession.findMany({
    where: {
      landings: {
        some: { landingId },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

export const replaceCashierLandings = async (
  cashierId: string,
  landingIds: string[],
) =>
  prisma.$transaction(async (tx) => {
    // Validate cashier exists
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

    // Get all sessions for this cashier and replace their landing bindings
    const cashierSessions = await tx.whatsappSession.findMany({
      where: { cashierId },
      select: { id: true },
    });

    const sessionIds = cashierSessions.map((s) => s.id);

    if (sessionIds.length > 0) {
      await tx.whatsappSessionLanding.deleteMany({
        where: {
          sessionId: { in: sessionIds },
        },
      });

      if (landingIds.length > 0) {
        // Bind all sessions to the specified landings
        const bindings = sessionIds.flatMap((sessionId) =>
          landingIds.map((landingId) => ({ sessionId, landingId })),
        );
        await tx.whatsappSessionLanding.createMany({
          data: bindings,
          skipDuplicates: true,
        });
      }
    }

    return tx.whatsappSessionLanding.findMany({
      where: {
        session: { cashierId },
      },
      include: {
        landing: true,
      },
    });
  });

// ---------------------------------------------------------------------------
// LandingFallbackPhone CRUD — B2.4
// ---------------------------------------------------------------------------

export const listLandingFallbackPhonesByLandingId = (landingId: string) =>
  prisma.landingFallbackPhone.findMany({
    where: { landingId },
    orderBy: [
      { order: 'asc' },
      { createdAt: 'asc' },
    ],
  });

export const createLandingFallbackPhone = (input: {
  landingId: string;
  phone: string;
  label?: string;
  order?: number;
}) =>
  prisma.landingFallbackPhone.create({
    data: {
      landingId: input.landingId,
      phone: input.phone,
      label: input.label ?? null,
      order: input.order ?? null,
    },
  });

export const updateLandingFallbackPhone = (
  id: string,
  patch: { phone?: string; label?: string | null; order?: number | null },
) =>
  prisma.landingFallbackPhone.update({
    where: { id },
    data: {
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.order !== undefined ? { order: patch.order } : {}),
    },
  });

export const countLandingFallbackPhonesByLandingId = (landingId: string) =>
  prisma.landingFallbackPhone.count({ where: { landingId } });

export const deleteLandingFallbackPhoneIfNotLast = async (
  id: string,
): Promise<{ deleted: true } | { deleted: false; reason: 'LAST_FALLBACK' }> => {
  return prisma.$transaction(
    async (tx) => {
      const row = await tx.landingFallbackPhone.findUniqueOrThrow({ where: { id } });
      const count = await tx.landingFallbackPhone.count({
        where: { landingId: row.landingId },
      });
      if (count <= 1) {
        return { deleted: false as const, reason: 'LAST_FALLBACK' as const };
      }
      await tx.landingFallbackPhone.delete({ where: { id } });
      return { deleted: true as const };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
};

export const createLandingWithFallbacks = async (
  landing: { url: string; metaPixelId: string; metaAccessToken: string },
  fallbacks: { phone: string; label?: string; order?: number }[],
) =>
  prisma.$transaction(async (tx) => {
    const created = await tx.landing.create({
      data: {
        url: landing.url,
        metaPixelId: landing.metaPixelId,
        metaAccessToken: landing.metaAccessToken,
      },
    });

    if (fallbacks.length > 0) {
      await tx.landingFallbackPhone.createMany({
        data: fallbacks.map((f) => ({
          landingId: created.id,
          phone: f.phone,
          label: f.label ?? null,
          order: f.order ?? null,
        })),
      });
    }

    return created;
  });

export const replaceLandingFallbacks = async (
  landingId: string,
  fallbacks: { phone: string; label?: string; order?: number }[],
): Promise<void> => {
  await prisma.$transaction(
    async (tx) => {
      const incomingPhones = fallbacks.map((f) => f.phone);

      // Delete rows not in the new set
      await tx.landingFallbackPhone.deleteMany({
        where: {
          landingId,
          phone: { notIn: incomingPhones },
        },
      });

      // Upsert each incoming fallback
      for (const f of fallbacks) {
        await tx.landingFallbackPhone.upsert({
          where: { landingId_phone: { landingId, phone: f.phone } },
          update: {
            label: f.label ?? null,
            order: f.order ?? null,
          },
          create: {
            landingId,
            phone: f.phone,
            label: f.label ?? null,
            order: f.order ?? null,
          },
        });
      }

      // Assert ≥1 fallback remains
      const remaining = await tx.landingFallbackPhone.count({ where: { landingId } });
      if (remaining < 1) {
        throw new Error('REPLACE_WOULD_LEAVE_ZERO_FALLBACKS');
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
};
