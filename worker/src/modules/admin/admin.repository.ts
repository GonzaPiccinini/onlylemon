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
    metaPixelId?: string;
    metaAccessToken?: string;
    metaPixelRef?: string | null;
    whatsappMessages?: string[];
  },
) =>
  prisma.landing.update({
    where: { id: landingId },
    data: {
      url: input.url,
      ...(input.metaPixelId !== undefined ? { metaPixelId: input.metaPixelId } : {}),
      ...(input.metaAccessToken ? { metaAccessToken: input.metaAccessToken } : {}),
      ...(input.metaPixelRef !== undefined ? { metaPixelRef: input.metaPixelRef } : {}),
      ...(input.whatsappMessages !== undefined ? { whatsappMessages: input.whatsappMessages } : {}),
    },
  });

export const getLandingByMetaPixelId = (metaPixelId: string) =>
  prisma.landing.findUnique({
    where: {
      metaPixelId,
    },
  });

/**
 * 3.7 — getLandingById
 * Includes nested metaPixelRelation (id, pixelId, label) for the pixel selector dropdown.
 */
export const getLandingById = (landingId: string) =>
  prisma.landing.findUnique({
    where: { id: landingId },
    include: {
      metaPixelRelation: {
        select: {
          id: true,
          pixelId: true,
          label: true,
        },
      },
    },
  });

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
  page?: number;
  pageSize?: number;
}) => {
  const page = filters.page ?? undefined;
  const pageSize = filters.pageSize ?? undefined;
  const skip = page !== undefined && pageSize !== undefined ? (page - 1) * pageSize : undefined;
  const take = pageSize;

  return {
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
    orderBy: [{ updateAt: 'desc' as const }, { id: 'desc' as const }],
    ...(skip !== undefined ? { skip } : {}),
    ...(take !== undefined ? { take } : {}),
  } satisfies Prisma.LeadFindManyArgs;
};

type LeadRow = Awaited<ReturnType<typeof prisma.lead.findMany<{
  include: {
    cashier: { include: { user: true } };
    conversions: { select: { createdAt: true }; orderBy: { createdAt: 'asc' }; take: 1 };
  };
}>>>[number];

type ListLeadsAdminFilters = {
  statuses?: Array<'NOT_CONTACTED' | 'CONTACTED' | 'CONVERTED'>;
  cashierId?: string;
  cashierIds?: string[];
  adCode?: string;
  code?: string;
  phone?: string;
  conversionCount?: { kind: 'gte' | 'lte'; value: number };
};

/**
 * Resolve the full set of lead ids that match the base filters AND the
 * conversion-count directive (RECARGA / converted-strict). Returns the ids and
 * the total count. This is the load-bearing part of the count-threshold filter
 * and is exported so it can be exercised against a real DB without depending on
 * the cashier `include` (which would touch columns subject to live-DB drift).
 *
 * Semantics (mirrors dashboard/src/lib/lead-status.ts):
 *   RECARGA ⊆ CONVERTED. A lead is recarga iff status='CONVERTED' AND it has
 *   >= value conversions; converted-strict iff status='CONVERTED' AND <= value.
 *   Non-CONVERTED selected leads always pass through by their raw status,
 *   regardless of conversion count.
 */
// Narrow surface of the Prisma client used by the resolver. Accepting this as a
// parameter (defaulting to the shared singleton) lets tests inject a client
// pointed at an explicit DB without depending on the singleton's frozen URL.
type LeadIdResolverClient = {
  $queryRaw: typeof prisma.$queryRaw;
  lead: { findMany: typeof prisma.lead.findMany };
};

export const resolveConversionCountLeadIds = async (
  baseWhere: Prisma.LeadWhereInput,
  conversionCount: { kind: 'gte' | 'lte'; value: number },
  client: LeadIdResolverClient = prisma,
): Promise<string[]> => {
  // baseWhere.status is produced by buildListLeadsQuery as `{ in: LeadStatus[] }`.
  type LeadStatusLiteral = 'NOT_CONTACTED' | 'CONTACTED' | 'CONVERTED';
  const selectedStatuses = baseWhere.status
    ? (baseWhere.status as { in: LeadStatusLiteral[] }).in
    : undefined;

  if (conversionCount.kind === 'gte') {
    // recarga selected (possibly alongside plain statuses like CONTACTED).
    // Matching set = UNION of:
    //   (a) recarga ids: CONVERTED leads with >= value conversions ∩ baseWhere
    //   (b) plain ids:   leads matching baseWhere with status in (selected − CONVERTED)
    // `count(*) >= value` is computed at the DB (pinned to status='CONVERTED' so a
    // non-CONVERTED anomaly is never treated as recarga); the candidate set is
    // then intersected with the FULL base filters so the returned ids — and the
    // total derived from them — stay consistent with the paginated page.
    const recargaCandidates = await client.$queryRaw<Array<{ leadId: string }>>(
      Prisma.sql`
        SELECT c."leadId"
        FROM "Conversion" c
        INNER JOIN "Lead" l ON l."id" = c."leadId"
        WHERE l."status" = 'CONVERTED'::"LeadStatus"
        GROUP BY c."leadId"
        HAVING COUNT(*) >= ${conversionCount.value}
      `,
    );
    const recargaCandidateIds = recargaCandidates.map((r) => r.leadId);
    const plainStatuses = (selectedStatuses ?? []).filter((s) => s !== 'CONVERTED');

    const [recargaMatches, plainMatches] = await Promise.all([
      recargaCandidateIds.length > 0
        ? client.lead.findMany({
            where: { id: { in: recargaCandidateIds }, ...baseWhere },
            select: { id: true },
          })
        : Promise.resolve([] as Array<{ id: string }>),
      plainStatuses.length > 0
        ? client.lead.findMany({
            where: { ...baseWhere, status: { in: plainStatuses } },
            select: { id: true },
          })
        : Promise.resolve([] as Array<{ id: string }>),
    ]);

    return Array.from(
      new Set([...recargaMatches.map((r) => r.id), ...plainMatches.map((r) => r.id)]),
    );
  }

  // converted-strict selected (possibly alongside plain statuses like CONTACTED).
  // Strategy:
  //   allIds  = every lead matching the full baseWhere (includes plain statuses
  //             AND CONVERTED leads; CONVERTED-with-0-conversions are kept here
  //             because they never appear in the conversion groupBy).
  //   recarga = CONVERTED leads with >= (value+1) conversions (status pinned to
  //             CONVERTED so a non-CONVERTED anomaly is never treated as recarga).
  //   result  = allIds − recarga.
  const [allIds, recargaRows] = await Promise.all([
    client.lead.findMany({ where: baseWhere, select: { id: true } }),
    client.$queryRaw<Array<{ leadId: string }>>(
      Prisma.sql`
        SELECT c."leadId"
        FROM "Conversion" c
        INNER JOIN "Lead" l ON l."id" = c."leadId"
        WHERE l."status" = 'CONVERTED'::"LeadStatus"
        GROUP BY c."leadId"
        HAVING COUNT(*) >= ${conversionCount.value + 1}
      `,
    ),
  ]);
  const recargaSet = new Set(recargaRows.map((r) => r.leadId));
  return allIds.map((r) => r.id).filter((id) => !recargaSet.has(id));
};

export const listLeadsAdmin = async (
  filters: ListLeadsAdminFilters,
  page: number,
  pageSize: number,
): Promise<[LeadRow[], number]> => {
  const { conversionCount, ...baseFilters } = filters;

  // mode='none': no conversionCount directive — use the existing common path unchanged.
  if (!conversionCount) {
    const q = buildListLeadsQuery({ ...baseFilters, page, pageSize });
    return Promise.all([
      prisma.lead.findMany(q),
      prisma.lead.count({ where: q.where }),
    ]) as Promise<[LeadRow[], number]>;
  }

  // Count-threshold mode: resolve the matching id set (consistent with `total`),
  // then fetch the requested page over those ids with the stable order.
  const baseWhere = buildListLeadsQuery({ ...baseFilters }).where;
  const matchingIds = await resolveConversionCountLeadIds(baseWhere, conversionCount);
  const total = matchingIds.length;
  if (total === 0) return [[], 0];

  const leads = await prisma.lead.findMany({
    where: { id: { in: matchingIds } },
    include: {
      cashier: { include: { user: true } },
      conversions: { select: { createdAt: true }, orderBy: { createdAt: 'asc' as const }, take: 1 },
    },
    orderBy: [{ updateAt: 'desc' as const }, { id: 'desc' as const }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return [leads as LeadRow[], total];
};

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
 * E6 — Count sessions for a cashier.
 */
export const countCashierSessions = (cashierId: string) =>
  prisma.whatsappSession.count({ where: { cashierId } });

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

// ---------------------------------------------------------------------------
// 3.2 — MetaPixel CRUD repository helpers
// ---------------------------------------------------------------------------

/**
 * MetaPixel select without accessToken (client-safe DTO shape).
 * accessToken MUST NEVER be returned in API responses.
 */
const metaPixelPublicSelect = {
  id: true,
  pixelId: true,
  label: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type MetaPixelPublicDto = {
  id: string;
  pixelId: string;
  label: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const createMetaPixel = (input: {
  pixelId: string;
  accessToken: string;
  label?: string;
}): Promise<MetaPixelPublicDto> =>
  prisma.metaPixel.create({
    data: {
      pixelId: input.pixelId,
      accessToken: input.accessToken,
      label: input.label ?? null,
    },
    select: metaPixelPublicSelect,
  });

export const listMetaPixels = (): Promise<MetaPixelPublicDto[]> =>
  prisma.metaPixel.findMany({
    select: metaPixelPublicSelect,
    orderBy: { createdAt: 'desc' },
  });

export const getMetaPixelById = (id: string): Promise<MetaPixelPublicDto | null> =>
  prisma.metaPixel.findUnique({
    where: { id },
    select: metaPixelPublicSelect,
  });

export const updateMetaPixel = (
  id: string,
  input: { pixelId?: string; accessToken?: string; label?: string | null },
): Promise<MetaPixelPublicDto | null> =>
  prisma.metaPixel.update({
    where: { id },
    data: {
      ...(input.pixelId !== undefined ? { pixelId: input.pixelId } : {}),
      ...(input.accessToken !== undefined ? { accessToken: input.accessToken } : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
    },
    select: metaPixelPublicSelect,
  });

export const deleteMetaPixel = async (id: string): Promise<void> => {
  await prisma.metaPixel.delete({ where: { id } });
};

export const countMetaPixelLeads = (metaPixelId: string): Promise<number> =>
  prisma.lead.count({ where: { metaPixelRef: metaPixelId } });

export const countMetaPixelLandings = (metaPixelId: string): Promise<number> =>
  prisma.landing.count({ where: { metaPixelRef: metaPixelId } });

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
