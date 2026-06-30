import { hashPassword } from '../../utils/password.js';
import { prisma } from '../../persistence/prisma/client.js';
import type { UpdateAdminAccountInput, UpdateAdminInput } from './admin.types.js';
import type { AdminStatus, Role } from '../../generated/prisma/client.js';
import { getSessions } from '../../integrations/waha/client.js';
import { emitCashierRuntimeStateChanged } from '../cashier/runtime-events.js';
import {
  createAdmin,
  createCashier,
  createLanding,
  createLandingFallbackPhone,
  createLandingWithFallbacks,
  deleteLandingFallbackPhoneIfNotLast,
  disableCashier,
  enableCashier,
  findAdminById,
  getConversionsByLeadContactedDateRange,
  getConversionsAggregateForLeads,
  getConversionsByDateRange,
  getFirstConversionsByDateRange,
  getConversionsWithLeadByDateRange,
  getConversionsTotals,
  getLeadHistory,
  getLeadsByDateRange,
  getSessionActivitiesByDateRange,
  listAdmins,
  listCashiers,
  getCashierById,
  listConversionsAdmin,
  listLandingFallbackPhonesByLandingId,
  listLandings,
  listLeadsAdmin,
  replaceLandingFallbacks,
  setAdminStatus,
  setLandingStatus,
  updateAdmin,
  updateAdminAccount,
  updateCashier,
  updateLanding,
  updateLandingFallbackPhone,
  updateCashierMaxSessions,
  countCashierSessions,
  getSessionWithLandings,
  replaceSessionLandings,
  getSessionsBoundToLandingId,
} from './admin.repository.js';
import {
  createSession,
  deleteWhatsappSession,
  listSessionsByCashier,
  SESSION_CAP_REACHED,
  SESSION_NOT_FOUND,
} from '../cashier/whatsapp-session.service.js';
import { _startWhatsappLinkForSessionUnsafe } from '../cashier/cashier.service.js';
import {
  finishCurrentSessionActivity,
  getCurrentSessionActivity,
} from '../cashier/cashier.repository.js';
import type { ConversionsTotalsDto, DateRangeQuery } from './admin.types.js';
import {
  argentinaDayEndUtcExclusive,
  argentinaDayStartUtc,
  formatArgentinaDayKey,
} from '../../utils/timezone.js';

const toRange = (query: DateRangeQuery) => ({
  from: argentinaDayStartUtc(query.from),
  to: argentinaDayEndUtcExclusive(query.to),
});

const toNumber = (value: unknown): number => Number(value);

const maskToken = (token: string): string => {
  const visibleTail = token.slice(-4);
  return `${'*'.repeat(Math.max(token.length - 4, 6))}${visibleTail}`;
};

const toLandingDto = (landing: {
  id: string;
  url: string;
  metaPixelId: string;
  metaAccessToken: string;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: landing.id,
  url: landing.url,
  metaPixelId: landing.metaPixelId,
  metaAccessTokenMasked: maskToken(landing.metaAccessToken),
  status: landing.status,
  createdAt: landing.createdAt,
  updatedAt: landing.updatedAt,
});

export const toLeadDto = (
  lead: {
    id: string;
    code: string;
    adCode: string | null;
    status: 'NOT_CONTACTED' | 'CONTACTED' | 'CONVERTED';
    phone: string | null;
    metaPixelId: string;
    contactedAt: Date | null;
    createdAt: Date;
    updateAt: Date;
    cashier?: {
      id: string;
      user: {
        name: string;
        username: string;
      };
    } | null;
    conversions?: Array<{ createdAt: Date }>;
  },
  aggregate?: { count: number; lastAt: Date | null },
) => {
  const firstConversion = lead.conversions?.[0];
  const firstConversionAt = firstConversion?.createdAt ?? null;

  const conversionsCount =
    aggregate?.count ?? (lead.conversions?.length ?? 0);
  const lastConversionAt =
    aggregate?.lastAt ??
    (lead.conversions && lead.conversions.length > 0
      ? lead.conversions[lead.conversions.length - 1].createdAt
      : null);

  const timeline: Array<{ status: 'NOT_CONTACTED' | 'CONTACTED' | 'CONVERTED'; at: Date }> = [
    { status: 'NOT_CONTACTED', at: lead.createdAt },
  ];
  if (lead.contactedAt) {
    timeline.push({ status: 'CONTACTED', at: lead.contactedAt });
  }
  if (firstConversionAt) {
    timeline.push({ status: 'CONVERTED', at: firstConversionAt });
  }
  timeline.sort((a, b) => a.at.getTime() - b.at.getTime());

  const lastStatusChangeAt = [lead.createdAt, lead.contactedAt, lastConversionAt]
    .filter((d): d is Date => d instanceof Date)
    .reduce((acc, d) => (d.getTime() > acc.getTime() ? d : acc), lead.createdAt);

  return {
    id: lead.id,
    code: lead.code,
    adCode: lead.adCode,
    status: lead.status,
    phone: lead.phone,
    metaPixelId: lead.metaPixelId,
    contactedAt: lead.contactedAt,
    createdAt: lead.createdAt,
    activityAt: lead.updateAt,
    cashierId: lead.cashier?.id ?? null,
    cashierName: lead.cashier?.user.name ?? null,
    cashierUsername: lead.cashier?.user.username ?? null,
    statusTimeline: timeline,
    conversionsCount,
    firstConversionAt,
    lastConversionAt,
    lastStatusChangeAt,
  };
};

export const buildLeadHistoryDto = (
  lead: { id: string; createdAt: Date; contactedAt: Date | null },
  conversions: Array<{ createdAt: Date }>,
  pagination: { page: number; pageSize: number; total: number; hasMore: boolean },
  firstConversionAt: Date | null = null,
) => ({
  id: lead.id,
  createdAt: lead.createdAt,
  contactedAt: lead.contactedAt,
  conversions: conversions.map((c) => ({ at: c.createdAt })),
  page: pagination.page,
  pageSize: pagination.pageSize,
  total: pagination.total,
  hasMore: pagination.hasMore,
  firstConversionAt,
});

const buildWahaStatusByName = async (): Promise<Map<string, string>> => {
  try {
    const sessions = await getSessions();
    return new Map(sessions.map((session) => [session.name, session.status]));
  } catch {
    return new Map();
  }
};

type ListCashiersDeps = {
  listCashiers: () => Promise<Array<{
    id: string;
    user: { name: string; username: string };
    status: string;
    maxSessions: number;
    createdAt: Date;
    sessions: Array<{ sessionName: string; whatsappPhoneNumber?: string | null }>;
    activity: Array<{ createdAt: Date }>;
  }>>;
  getSessions: () => Promise<Array<{ name: string; status: string }>>;
};

export const listCashiersServiceImpl = async (deps: ListCashiersDeps) => {
  const cashiers = await deps.listCashiers();

  let wahaStatusByName = new Map<string, string>();
  try {
    const wahaSessions = await deps.getSessions();
    wahaStatusByName = new Map(wahaSessions.map((s) => [s.name, s.status]));
  } catch {
    // WAHA unavailable — degrade gracefully (workingSessionsCount = 0 for all)
    console.warn('[admin] WAHA getSessions failed; workingSessionsCount degraded to 0');
  }

  return cashiers.map((cashier) => {
    const activeActivity = cashier.activity[0] ?? null;
    const hasActiveWorkSession = activeActivity !== null;

    const enrichedSessions = cashier.sessions.map((s) => ({
      ...s,
      wahaStatus: wahaStatusByName.get(s.sessionName) ?? 'STOPPED',
    }));

    const workingSessionsCount = enrichedSessions.filter(
      (s) => s.wahaStatus === 'WORKING',
    ).length;

    // Legacy: canOperateLeads = ACTIVE + at least 1 WORKING session
    const canOperateLeads = cashier.status === 'ACTIVE' && workingSessionsCount > 0;

    return {
      id: cashier.id,
      name: cashier.user.name,
      username: cashier.user.username,
      status: cashier.status,
      maxSessions: cashier.maxSessions,
      createdAt: cashier.createdAt,
      sessions: enrichedSessions,
      workingSessionsCount,
      hasActiveWorkSession,
      sessionStartedAt: activeActivity?.createdAt ?? null,
      canOperateLeads,
    };
  });
};

export const listCashiersService = async () =>
  listCashiersServiceImpl({ listCashiers, getSessions });

export const createCashierService = async (input: {
  name: string;
  username: string;
  password: string;
}) => {
  const created = await createCashier({
    ...input,
    password: await hashPassword(input.password),
  });

  // B6: Auto-create 1 WhatsappSession after cashier row is created
  const compactId = created.id.replace(/-/g, '');
  const suffix = Date.now().toString(36);
  const sessionName = `cashier-${compactId}-${suffix}`;
  await prisma.whatsappSession.create({
    data: {
      cashierId: created.id,
      sessionName,
    },
  });

  return {
    id: created.id,
    name: created.user.name,
    username: created.user.username,
    status: created.status,
    maxSessions: created.maxSessions,
    createdAt: created.createdAt,
    sessions: created.sessions,
  };
};

export const updateCashierService = async (
  cashierId: string,
  input: { name: string; username: string; password?: string },
) => {
  const updated = await updateCashier(cashierId, {
    ...input,
    ...(input.password ? { password: await hashPassword(input.password) } : {}),
  });
  if (!updated) {
    return null;
  }

  return {
    id: updated.id,
    name: updated.user.name,
    username: updated.user.username,
    status: updated.status,
    maxSessions: updated.maxSessions,
    createdAt: updated.createdAt,
    sessions: updated.sessions,
  };
};

export const disableCashierService = async (cashierId: string) => {
  const now = new Date();

  // B5: Cascade delete all WhatsappSessions (WAHA best-effort + DB always)
  const { disableCashierSessions } = await import('../cashier/whatsapp-session.service.js');
  await disableCashierSessions(cashierId);

  await finishCurrentSessionActivity(cashierId, now);

  const disabled = await disableCashier(cashierId);
  emitCashierRuntimeStateChanged(cashierId);

  return {
    id: disabled.id,
    name: disabled.user.name,
    username: disabled.user.username,
    status: disabled.status,
    maxSessions: disabled.maxSessions,
    createdAt: disabled.createdAt,
    sessions: disabled.sessions,
  };
};

export const finishCashierWorkSessionService = async (cashierId: string) => {
  const cashier = await getCashierById(cashierId);
  if (!cashier) {
    return { kind: 'NOT_FOUND' as const };
  }

  const current = await getCurrentSessionActivity(cashierId);
  if (!current) {
    return { kind: 'NO_ACTIVE_SESSION' as const };
  }

  await finishCurrentSessionActivity(cashierId, new Date());
  emitCashierRuntimeStateChanged(cashierId);

  return { kind: 'OK' as const };
};

export const enableCashierService = async (cashierId: string) => {
  const enabled = await enableCashier(cashierId);
  return {
    id: enabled.id,
    name: enabled.user.name,
    username: enabled.user.username,
    status: enabled.status,
    maxSessions: enabled.maxSessions,
    createdAt: enabled.createdAt,
    sessions: enabled.sessions,
  };
};

export const getSummaryService = async (query: DateRangeQuery) => {
  const range = toRange(query);
  const [leads, activities, conversions] = await Promise.all([
    getLeadsByDateRange(range.from, range.to, query.cashierId),
    getSessionActivitiesByDateRange(range.from, range.to, query.cashierId),
    getConversionsWithLeadByDateRange(range.from, range.to, query.cashierId),
  ]);

  const notContacted = leads.filter(
    (lead) => lead.status === 'NOT_CONTACTED',
  ).length;
  const contacted = leads.filter((lead) => lead.status === 'CONTACTED').length;
  const converted = leads.filter((lead) => lead.status === 'CONVERTED').length;
  // EXPIRED was removed in meta-conversions-refactor migration; always 0 for compat shim
  const expiredLeads = 0;
  const totalLeads = notContacted + contacted + converted;

  const totalConvertedValue = conversions.reduce(
    (acc, conv) => acc + conv.amount.toNumber(),
    0,
  );
  const averageConvertedValue =
    conversions.length === 0 ? 0 : totalConvertedValue / conversions.length;
  const totalConversionHours = conversions.reduce(
    (acc, conv) =>
      acc +
      (conv.createdAt.getTime() - conv.lead.createdAt.getTime()) /
        1000 /
        60 /
        60,
    0,
  );
  const averageConversionHours =
    conversions.length === 0 ? 0 : totalConversionHours / conversions.length;

  const totalActiveMinutes = activities.reduce((acc, item) => {
    if (!item.endedAt) {
      return acc;
    }

    return (
      acc + (item.endedAt.getTime() - item.createdAt.getTime()) / 1000 / 60
    );
  }, 0);

  return {
    totalLeads,
    notContactedLeads: notContacted,
    contactedLeads: contacted,
    convertedLeads: converted,
    expiredLeads,
    conversionRate: totalLeads === 0 ? 0 : (converted / totalLeads) * 100,
    totalConvertedValue,
    averageConvertedValue,
    averageConversionHours,
    totalActiveHours: totalActiveMinutes / 60,
  };
};

export const getCashierStatsService = async (query: DateRangeQuery) => {
  const range = toRange(query);
  const [leads, activities, conversions] = await Promise.all([
    getLeadsByDateRange(range.from, range.to, query.cashierId),
    getSessionActivitiesByDateRange(range.from, range.to, query.cashierId),
    getConversionsWithLeadByDateRange(range.from, range.to, query.cashierId),
  ]);

  const grouped = new Map<
    string,
    {
      cashierId: string;
      cashierName: string;
      totalLeads: number;
      contactedLeads: number;
      convertedLeads: number;
      expiredLeads: number;
      convertedValue: number;
      activeMinutes: number;
    }
  >();

  leads.forEach((lead) => {
    if (!lead.cashier) {
      return;
    }

    const cashierId = lead.cashier.id;
    const cashierName = lead.cashier.user.name;

    if (!grouped.has(cashierId)) {
      grouped.set(cashierId, {
        cashierId,
        cashierName,
        totalLeads: 0,
        contactedLeads: 0,
        convertedLeads: 0,
        expiredLeads: 0,
        convertedValue: 0,
        activeMinutes: 0,
      });
    }

    const current = grouped.get(cashierId);
    if (!current) {
      return;
    }

    current.totalLeads += 1;
    if (lead.status === 'CONTACTED') {
      current.contactedLeads += 1;
    }

    if (lead.status === 'CONVERTED') {
      current.convertedLeads += 1;
    }

    // EXPIRED was removed in meta-conversions-refactor; expiredLeads stays at 0 (compat shim)
  });

  conversions.forEach((conv) => {
    const cashier = conv.lead.cashier;
    if (!cashier) {
      return;
    }

    if (!grouped.has(cashier.id)) {
      grouped.set(cashier.id, {
        cashierId: cashier.id,
        cashierName: cashier.user.name,
        totalLeads: 0,
        contactedLeads: 0,
        convertedLeads: 0,
        expiredLeads: 0,
        convertedValue: 0,
        activeMinutes: 0,
      });
    }

    const current = grouped.get(cashier.id);
    if (!current) {
      return;
    }

    current.convertedValue += conv.amount.toNumber();
  });

  activities.forEach((item) => {
    if (!item.endedAt) {
      return;
    }

    const cashierId = item.cashierId;
    const cashierName = item.cashier.user.name;

    if (!grouped.has(cashierId)) {
      grouped.set(cashierId, {
        cashierId,
        cashierName,
        totalLeads: 0,
        contactedLeads: 0,
        convertedLeads: 0,
        expiredLeads: 0,
        convertedValue: 0,
        activeMinutes: 0,
      });
    }

    const current = grouped.get(cashierId);
    if (!current) {
      return;
    }

    current.activeMinutes +=
      (item.endedAt.getTime() - item.createdAt.getTime()) / 1000 / 60;
  });

  return [...grouped.values()].map((entry) => ({
    cashierId: entry.cashierId,
    cashierName: entry.cashierName,
    totalLeads: entry.totalLeads,
    contactedLeads: entry.contactedLeads,
    convertedLeads: entry.convertedLeads,
    expiredLeads: entry.expiredLeads,
    conversionRate:
      entry.totalLeads === 0
        ? 0
        : (entry.convertedLeads / entry.totalLeads) * 100,
    convertedValue: entry.convertedValue,
    activeHours: entry.activeMinutes / 60,
  }));
};


/**
 * M2.9 — groupConversionsByDay
 * Groups Conversion rows by Argentina day bucket, summing amounts and counting rows.
 */
export const groupConversionsByDay = (
  conversions: Array<{ createdAt: Date; amount: { toNumber: () => number } }>,
): Array<{ date: string; count: number; sum: number }> => {
  const grouped = new Map<string, { count: number; sum: number }>();

  conversions.forEach((conv) => {
    const day = formatArgentinaDayKey(conv.createdAt);
    const existing = grouped.get(day) ?? { count: 0, sum: 0 };
    grouped.set(day, {
      count: existing.count + 1,
      sum: existing.sum + conv.amount.toNumber(),
    });
  });

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, { count, sum }]) => ({ date, count, sum }));
};

const groupAmountsByDay = (
  rows: Array<{ at: Date; amount: { toNumber: () => number } }>,
): Array<{ date: string; count: number; sum: number }> => {
  const grouped = new Map<string, { count: number; sum: number }>();

  rows.forEach((row) => {
    const day = formatArgentinaDayKey(row.at);
    const existing = grouped.get(day) ?? { count: 0, sum: 0 };
    grouped.set(day, {
      count: existing.count + 1,
      sum: existing.sum + row.amount.toNumber(),
    });
  });

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, { count, sum }]) => ({ date, count, sum }));
};

type FundsSeriesRepo = {
  getConversionsByDateRange: (
    from: Date,
    to: Date,
    cashierId?: string,
  ) => Promise<Array<{ createdAt: Date; amount: { toNumber: () => number } }>>;
  getConversionsByLeadContactedDateRange: (
    from: Date,
    to: Date,
    cashierId?: string,
  ) => Promise<
    Array<{
      amount: { toNumber: () => number };
      lead: { contactedAt: Date | null };
    }>
  >;
  getFirstConversionsByDateRange: (
    from: Date,
    to: Date,
    cashierId?: string,
  ) => Promise<Array<{ createdAt: Date; amount: { toNumber: () => number } }>>;
};

export const getFundsSeriesServiceImpl = async (
  repo: FundsSeriesRepo,
  query: DateRangeQuery,
) => {
  const range = toRange(query);
  const [grossByConversionDateRows, incomeByContactedDateRows, firstChargeRows] =
    await Promise.all([
      repo.getConversionsByDateRange(range.from, range.to, query.cashierId),
      repo.getConversionsByLeadContactedDateRange(range.from, range.to, query.cashierId),
      repo.getFirstConversionsByDateRange(range.from, range.to, query.cashierId),
    ]);

  return {
    grossByConversionDate: groupConversionsByDay(grossByConversionDateRows),
    incomeByContactedDate: groupAmountsByDay(
      incomeByContactedDateRows.flatMap((row) =>
        row.lead.contactedAt
          ? [
              {
                at: row.lead.contactedAt,
                amount: row.amount,
              },
            ]
          : [],
      ),
    ),
    firstChargesByDate: groupConversionsByDay(firstChargeRows),
  };
};

export const getFundsSeriesService = async (query: DateRangeQuery) =>
  getFundsSeriesServiceImpl(
    {
      getConversionsByDateRange,
      getConversionsByLeadContactedDateRange,
      getFirstConversionsByDateRange,
    },
    query,
  );

type DbLeadStatus = 'NOT_CONTACTED' | 'CONTACTED' | 'CONVERTED';
type LeadRow = {
  id: string;
  code: string;
  adCode: string | null;
  status: DbLeadStatus;
  phone: string | null;
  metaPixelId: string;
  contactedAt: Date | null;
  createdAt: Date;
  updateAt: Date;
  cashier?: { id: string; user: { name: string; username: string } } | null;
  conversions?: Array<{ createdAt: Date }>;
};
type ListLeadsFn = (filters: {
  statuses?: DbLeadStatus[];
  cashierId?: string;
  cashierIds?: string[];
  adCode?: string;
  code?: string;
  phone?: string;
  page?: number;
  pageSize?: number;
  dateFrom?: Date;
  dateTo?: Date;
  conversionCount?: { kind: 'gte' | 'lte'; value: number };
}) => Promise<[LeadRow[], number]>;

type GetConversionsAggregateFn = (ids: string[]) => Promise<Map<string, { count: number; lastAt: Date | null }>>;

type PostFilterMode = 'none' | 'converted-strict' | 'recarga-only';

export const listLeadsServiceImpl = async (
  deps: { listLeads: ListLeadsFn; getConversionsAggregateForLeads: GetConversionsAggregateFn },
  filters: { statuses?: string[]; cashierId?: string; cashierIds?: string[]; adCode?: string; code?: string; phone?: string; page?: number; pageSize?: number; dateFrom?: Date; dateTo?: Date },
) => {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;

  const requested = filters.statuses;
  const requestedSet = new Set(requested ?? []);
  const hasConverted = requestedSet.has('CONVERTED');
  const hasRecarga = requestedSet.has('RECARGA');

  // Normalize: translate RECARGA→CONVERTED and dedup for DB query
  const dbStatuses = requested
    ? (Array.from(new Set(requested.map((s) => (s === 'RECARGA' ? 'CONVERTED' : s)))) as DbLeadStatus[])
    : undefined;

  // Determine filter mode
  let mode: PostFilterMode = 'none';
  if (hasRecarga && !hasConverted) mode = 'recarga-only';
  else if (hasConverted && !hasRecarga) mode = 'converted-strict';

  // Pass conversionCount directive to the repo for DB-level filtering (mode != 'none')
  const conversionCount =
    mode === 'recarga-only'
      ? ({ kind: 'gte', value: 2 } as const)
      : mode === 'converted-strict'
        ? ({ kind: 'lte', value: 1 } as const)
        : undefined;

  const [leads, total] = await deps.listLeads({ ...filters, statuses: dbStatuses, page, pageSize, conversionCount });
  const aggregateById = await deps.getConversionsAggregateForLeads(leads.map((lead) => lead.id));

  return {
    items: leads.map((lead) =>
      toLeadDto(lead, aggregateById.get(lead.id) ?? { count: 0, lastAt: null }),
    ),
    total,
    page,
    pageSize,
  };
};

type ListLeadsFilters = {
  statuses?: string[];
  cashierId?: string;
  cashierIds?: string[];
  adCode?: string;
  code?: string;
  phone?: string;
  page?: number;
  pageSize?: number;
  dateFrom?: Date;
  dateTo?: Date;
};

export const listLeadsService = async (filters: ListLeadsFilters) =>
  listLeadsServiceImpl(
    {
      listLeads: (f) => listLeadsAdmin(f, f.page ?? 1, f.pageSize ?? 25),
      getConversionsAggregateForLeads,
    },
    filters,
  );

type GetLeadHistoryFn = (
  leadId: string,
  opts: { page: number; pageSize: number; dateFrom?: Date; dateTo?: Date },
) => Promise<{
  lead: { id: string; createdAt: Date; contactedAt: Date | null } | null;
  conversions: Array<{ createdAt: Date }>;
  total: number;
  firstConversion: { createdAt: Date } | null;
}>;

export const getLeadHistoryServiceImpl = async (
  deps: { getLeadHistory: GetLeadHistoryFn },
  leadId: string,
  opts: { page: number; pageSize: number; dateFrom?: Date; dateTo?: Date } = { page: 1, pageSize: 10 },
) => {
  const { lead, conversions, total, firstConversion } = await deps.getLeadHistory(leadId, opts);
  if (!lead) return null;
  const hasMore = opts.page * opts.pageSize < total;
  const firstConversionAt = firstConversion?.createdAt ?? null;
  return buildLeadHistoryDto(lead, conversions, {
    page: opts.page,
    pageSize: opts.pageSize,
    total,
    hasMore,
  }, firstConversionAt);
};

export const getLeadHistoryService = async (
  leadId: string,
  opts: { page: number; pageSize: number; dateFrom?: Date; dateTo?: Date } = { page: 1, pageSize: 10 },
) => getLeadHistoryServiceImpl({ getLeadHistory }, leadId, opts);

export const listLandingsService = async () => {
  const landings = await listLandings();
  return landings.map(toLandingDto);
};

export const setLandingStatusService = async (
  landingId: string,
  status: 'ACTIVE' | 'DISABLED',
) => {
  const landing = await setLandingStatus(landingId, status);
  return toLandingDto(landing);
};

export const updateAdminAccountService = async (
  userId: string,
  input: UpdateAdminAccountInput,
) => {
  const updated = await updateAdminAccount(userId, {
    ...(input.username ? { username: input.username } : {}),
    ...(input.password ? { password: await hashPassword(input.password) } : {}),
  });
  return { id: updated.id, name: updated.name, username: updated.username };
};

// ---------------------------------------------------------------------------
// Admin CRUD — error classes (tasks 19–22)
// ---------------------------------------------------------------------------

export class AdminNotFoundError extends Error {
  constructor() {
    super('Admin not found');
    this.name = 'AdminNotFoundError';
  }
}

/**
 * SelfDisableError is thrown by setAdminStatusService when the caller tries
 * to change their own status. Self-edit of name/username/password is allowed
 * (per locked decision 6), but self-status-change is not (REQ-ADMIN-STATUS-1).
 */
export class SelfDisableError extends Error {
  constructor() {
    super('Cannot change own admin status');
    this.name = 'SelfDisableError';
  }
}

// ---------------------------------------------------------------------------
// Admin CRUD — DTO mapper (task 19–22)
// ---------------------------------------------------------------------------

const toAdminDto = (admin: {
  id: string;
  status: AdminStatus;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string; username: string; role: Role };
}) => ({
  id: admin.id,
  userId: admin.user.id,
  name: admin.user.name,
  username: admin.user.username,
  role: admin.user.role as 'ADMIN' | 'SUPER_ADMIN',
  status: admin.status as 'ACTIVE' | 'DISABLED',
  createdAt: admin.createdAt,
  updatedAt: admin.updatedAt,
});

// ---------------------------------------------------------------------------
// Admin CRUD services (tasks 19–22)
// ---------------------------------------------------------------------------

/**
 * Task 19 — createAdminService
 * Hashes password, creates User+Admin in a transaction, returns DTO.
 * Username collision is surfaced as a Prisma P2002 error — the controller maps it to 409.
 */
export const createAdminService = async (input: {
  name: string;
  username: string;
  password: string;
}) => {
  const created = await createAdmin({
    name: input.name,
    username: input.username,
    hashedPassword: await hashPassword(input.password),
  });
  return toAdminDto(created);
};

/**
 * Task 20 — listAdminsService
 * Thin wrapper that returns all admins (ADMIN + SUPER_ADMIN) ordered by createdAt DESC.
 */
export const listAdminsService = async () => {
  const admins = await listAdmins();
  return admins.map(toAdminDto);
};

/**
 * Task 21 — updateAdminService
 * Partial update — at least one field required (validated upstream via updateAdminSchema).
 * Does NOT block self-edit per locked decision 6.
 * Throws AdminNotFoundError if admin does not exist.
 * Username collision surfaces as Prisma P2002 — controller maps to 409.
 */
export const updateAdminService = async (
  adminId: string,
  input: UpdateAdminInput,
) => {
  const updated = await updateAdmin(adminId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.username !== undefined ? { username: input.username } : {}),
    ...(input.password ? { hashedPassword: await hashPassword(input.password) } : {}),
  });
  if (!updated) throw new AdminNotFoundError();
  return toAdminDto(updated);
};

/**
 * Task 22 — setAdminStatusService
 * Blocks self-disable: if the target admin's userId equals the caller's userId,
 * throws SelfDisableError (mapped to 403 in the controller).
 * This applies regardless of whether the requested status is ACTIVE or DISABLED.
 */
export const setAdminStatusService = async (
  callerUserId: string,
  adminId: string,
  status: 'ACTIVE' | 'DISABLED',
) => {
  const target = await findAdminById(adminId);
  if (!target) throw new AdminNotFoundError();
  if (target.user.id === callerUserId) throw new SelfDisableError();

  const updated = await setAdminStatus(adminId, status);
  return toAdminDto(updated);
};

/**
 * M2.5 — listAdminConversionsService
 * Returns paginated admin conversions with all filters.
 */
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

export const listAdminConversionsService = async (
  filters: ConversionsAdminFilters,
  page = 1,
  pageSize = 25,
) => {
  const [rows, total] = await listConversionsAdmin(filters, page, pageSize);

  const items = rows.map((c) => ({
    id: c.id,
    leadId: c.leadId,
    code: c.lead.code,
    adCode: c.lead.adCode,
    phone: c.lead.phone,
    cashierId: c.lead.cashier?.id ?? null,
    cashierName: c.lead.cashier?.user.name ?? null,
    amount: c.amount,
    createdAt: c.createdAt,
  }));

  return { items, total, page, pageSize };
};

// ---------------------------------------------------------------------------
// admin-conversions-totals — M3
// ---------------------------------------------------------------------------

type ConversionsTotalsRepo = {
  getConversionsTotals: (filters: ConversionsAdminFilters) => Promise<{
    _count: { _all: number };
    _sum: { amount: { toNumber: () => number } | null };
    _avg: { amount: { toNumber: () => number } | null };
  }>;
};

export const getAdminConversionsTotalsServiceImpl = async (
  repo: ConversionsTotalsRepo,
  filters: ConversionsAdminFilters,
): Promise<ConversionsTotalsDto> => {
  const result = await repo.getConversionsTotals(filters);
  return {
    totalAmount: result._sum.amount?.toNumber() ?? 0,
    count: result._count._all,
    averageAmount: result._avg.amount?.toNumber() ?? 0,
  };
};

export const getAdminConversionsTotalsService = (
  filters: ConversionsAdminFilters,
): Promise<ConversionsTotalsDto> =>
  getAdminConversionsTotalsServiceImpl({ getConversionsTotals }, filters);

// ---------------------------------------------------------------------------
// B5.3 — Typed errors for LandingFallbackPhone domain
// ---------------------------------------------------------------------------

export class InvalidPhoneFormatError extends Error {
  constructor(phone: string) {
    super(`Invalid phone format: "${phone}"`);
    this.name = 'InvalidPhoneFormatError';
  }
}

export class LastFallbackError extends Error {
  constructor() {
    super('Debes agregar otro respaldo antes de eliminar este');
    this.name = 'LastFallbackError';
  }
}

export class MissingFallbacksError extends Error {
  constructor() {
    super('Debe agregar al menos un teléfono de respaldo');
    this.name = 'MissingFallbacksError';
  }
}

// ---------------------------------------------------------------------------
// B5.3 — validatePhone helper
// ---------------------------------------------------------------------------

const PHONE_REGEX = /^\+?[0-9]{8,15}$/;

export const validatePhone = (phone: string): void => {
  if (!PHONE_REGEX.test(phone)) {
    throw new InvalidPhoneFormatError(phone);
  }
};

/** @deprecated Use validatePhone instead */
export const validateE164 = validatePhone;

// ---------------------------------------------------------------------------
// B5.4 — LandingFallbackPhone DTO mapper
// ---------------------------------------------------------------------------

const toLandingFallbackPhoneDto = (row: {
  id: string;
  landingId: string;
  phone: string;
  label: string | null;
  order: number | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: row.id,
  landingId: row.landingId,
  phone: row.phone,
  label: row.label,
  order: row.order,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

// ---------------------------------------------------------------------------
// B5.4 — LandingFallbackPhone CRUD service functions
// ---------------------------------------------------------------------------

export const listLandingFallbackPhonesService = async (landingId: string) => {
  const rows = await listLandingFallbackPhonesByLandingId(landingId);
  return rows.map(toLandingFallbackPhoneDto);
};

export const createLandingFallbackPhoneService = async (
  landingId: string,
  input: { phone: string; label?: string; order?: number },
) => {
  validatePhone(input.phone);
  const row = await createLandingFallbackPhone({ landingId, ...input });
  return toLandingFallbackPhoneDto(row);
};

export const updateLandingFallbackPhoneService = async (
  id: string,
  patch: { phone?: string; label?: string | null; order?: number | null },
) => {
  if (patch.phone !== undefined) {
    validatePhone(patch.phone);
  }
  const row = await updateLandingFallbackPhone(id, patch);
  return toLandingFallbackPhoneDto(row);
};

// Impl variant for testability (injectable repo)
export const deleteLandingFallbackPhoneServiceImpl = async (
  deps: {
    deleteLandingFallbackPhoneIfNotLast: (
      id: string,
    ) => Promise<{ deleted: true } | { deleted: false; reason: 'LAST_FALLBACK' }>;
  },
  id: string,
): Promise<void> => {
  const result = await deps.deleteLandingFallbackPhoneIfNotLast(id);
  if (!result.deleted) {
    throw new LastFallbackError();
  }
};

export const deleteLandingFallbackPhoneService = async (id: string): Promise<void> =>
  deleteLandingFallbackPhoneServiceImpl({ deleteLandingFallbackPhoneIfNotLast }, id);

// ---------------------------------------------------------------------------
// B5.5 — Extended createLanding / updateLanding with fallbackPhones
// ---------------------------------------------------------------------------

// Impl variant for testability (injectable repo)
export const createLandingServiceImpl = async (
  deps: {
    createLandingWithFallbacks: (
      landing: { url: string; metaPixelId: string; metaAccessToken: string },
      fallbacks: { phone: string; label?: string; order?: number }[],
    ) => Promise<{
      id: string;
      url: string;
      metaPixelId: string;
      metaAccessToken: string;
      status: 'ACTIVE' | 'DISABLED';
      createdAt: Date;
      updatedAt: Date;
    }>;
  },
  input: {
    url: string;
    metaPixelId: string;
    metaAccessToken: string;
    fallbackPhones: { phone: string; label?: string; order?: number }[];
  },
) => {
  if (input.fallbackPhones.length === 0) {
    throw new MissingFallbacksError();
  }
  for (const fp of input.fallbackPhones) {
    validatePhone(fp.phone);
  }
  const landing = await deps.createLandingWithFallbacks(
    { url: input.url, metaPixelId: input.metaPixelId, metaAccessToken: input.metaAccessToken },
    input.fallbackPhones,
  );
  return toLandingDto(landing);
};

export const createLandingServiceWithFallbacks = async (input: {
  url: string;
  metaPixelId: string;
  metaAccessToken: string;
  fallbackPhones: { phone: string; label?: string; order?: number }[];
}) => createLandingServiceImpl({ createLandingWithFallbacks }, input);

// Impl variant for testability (injectable repo)
export const updateLandingServiceImpl = async (
  deps: {
    updateLanding: (
      id: string,
      input: { url: string; metaPixelId: string; metaAccessToken?: string },
    ) => Promise<{
      id: string;
      url: string;
      metaPixelId: string;
      metaAccessToken: string;
      status: 'ACTIVE' | 'DISABLED';
      createdAt: Date;
      updatedAt: Date;
    }>;
    replaceLandingFallbacks: (
      landingId: string,
      fallbacks: { phone: string; label?: string; order?: number }[],
    ) => Promise<void>;
  },
  landingId: string,
  input: {
    url: string;
    metaPixelId: string;
    metaAccessToken?: string;
    fallbackPhones?: { phone: string; label?: string; order?: number }[];
  },
) => {
  if (input.fallbackPhones !== undefined) {
    if (input.fallbackPhones.length === 0) {
      throw new MissingFallbacksError();
    }
    for (const fp of input.fallbackPhones) {
      validatePhone(fp.phone);
    }
  }
  const landing = await deps.updateLanding(landingId, {
    url: input.url,
    metaPixelId: input.metaPixelId,
    metaAccessToken: input.metaAccessToken,
  });
  if (input.fallbackPhones !== undefined) {
    await deps.replaceLandingFallbacks(landingId, input.fallbackPhones);
  }
  return toLandingDto(landing);
};

export const updateLandingServiceWithFallbacks = async (
  landingId: string,
  input: {
    url: string;
    metaPixelId: string;
    metaAccessToken?: string;
    fallbackPhones?: { phone: string; label?: string; order?: number }[];
  },
) => updateLandingServiceImpl({ updateLanding, replaceLandingFallbacks }, landingId, input);

// ---------------------------------------------------------------------------
// E — WhatsappSession admin services
// ---------------------------------------------------------------------------

export class SessionCapReachedError extends Error {
  constructor() {
    super(SESSION_CAP_REACHED);
    this.name = 'SessionCapReachedError';
  }
}

export class SessionNotFoundError extends Error {
  constructor() {
    super(SESSION_NOT_FOUND);
    this.name = 'SessionNotFoundError';
  }
}

export const MAX_SESSIONS_BELOW_CURRENT = 'MAX_SESSIONS_BELOW_CURRENT';

export class MaxSessionsBelowCurrentError extends Error {
  readonly currentCount: number;
  constructor(currentCount: number) {
    super(MAX_SESSIONS_BELOW_CURRENT);
    this.name = 'MaxSessionsBelowCurrentError';
    this.currentCount = currentCount;
  }
}

/**
 * E1 — List sessions for a cashier (with live WAHA status).
 */
export const listCashierSessionsService = async (cashierId: string) => {
  const cashier = await getCashierById(cashierId);
  if (!cashier) {
    return null;
  }
  const sessions = await listSessionsByCashier(cashierId);
  const wahaStatusByName = await buildWahaStatusByName();

  return sessions.map((s) => ({
    id: s.id,
    cashierId: s.cashierId,
    sessionName: s.sessionName,
    whatsappPhoneNumber: s.whatsappPhoneNumber,
    alias: s.alias,
    refreshCount: s.refreshCount,
    lastRefreshAt: s.lastRefreshAt,
    wahaStatus: wahaStatusByName.get(s.sessionName) ?? 'STOPPED',
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
};

/**
 * E2 — Create new session for a cashier (enforces maxSessions).
 */
export const createCashierSessionService = async (cashierId: string) => {
  const cashier = await getCashierById(cashierId);
  if (!cashier) {
    return null;
  }
  try {
    const session = await createSession(cashierId);
    emitCashierRuntimeStateChanged(cashierId);
    return session;
  } catch (error) {
    if (error instanceof Error && error.message === SESSION_CAP_REACHED) {
      throw new SessionCapReachedError();
    }
    throw error;
  }
};

/**
 * E3 — Delete a session (WAHA best-effort + DB).
 */
export const deleteCashierSessionService = async (sessionId: string) => {
  // Capture cashierId BEFORE delete so we can notify the owner's SSE stream
  const session = await prisma.whatsappSession.findUnique({
    where: { id: sessionId },
    select: { cashierId: true },
  });
  try {
    const result = await deleteWhatsappSession(sessionId);
    if (session) {
      emitCashierRuntimeStateChanged(session.cashierId);
    }
    return result;
  } catch (error) {
    if (error instanceof Error && error.message === SESSION_NOT_FOUND) {
      throw new SessionNotFoundError();
    }
    throw error;
  }
};

/**
 * E4a — Get landings for a session.
 */
export const getSessionLandingsService = async (sessionId: string) => {
  const session = await getSessionWithLandings(sessionId);
  if (!session) {
    return null;
  }
  return session.landings.map((wsl) => toLandingDto(wsl.landing));
};

/**
 * E4b — Replace landings for a session (full-replace semantics).
 */
export const replaceSessionLandingsService = async (
  sessionId: string,
  landingIds: string[],
) => {
  const session = await getSessionWithLandings(sessionId);
  if (!session) {
    return null;
  }
  const updated = await replaceSessionLandings(sessionId, landingIds);
  return updated.map((wsl) => toLandingDto(wsl.landing));
};

/**
 * E5 (landing side) — Get sessions bound to a landing.
 */
export const getLandingSessionsService = async (landingId: string) => {
  const landing = await prisma.landing.findUnique({ where: { id: landingId } });
  if (!landing) {
    return null;
  }
  const sessions = await getSessionsBoundToLandingId(landingId);
  const wahaStatusByName = await buildWahaStatusByName();
  return sessions.map((s) => ({
    id: s.id,
    cashierId: s.cashierId,
    sessionName: s.sessionName,
    whatsappPhoneNumber: s.whatsappPhoneNumber,
    wahaStatus: wahaStatusByName.get(s.sessionName) ?? 'STOPPED',
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
};

/**
 * E6 — Update cashier maxSessions (PATCH /admin/cashiers/:id).
 */
export const updateCashierMaxSessionsService = async (
  cashierId: string,
  maxSessions: number,
) => {
  const currentCount = await countCashierSessions(cashierId);
  if (maxSessions < currentCount) {
    throw new MaxSessionsBelowCurrentError(currentCount);
  }
  const updated = await updateCashierMaxSessions(cashierId, maxSessions);
  if (!updated) {
    return null;
  }
  emitCashierRuntimeStateChanged(cashierId);
  return {
    id: updated.id,
    name: updated.user.name,
    username: updated.user.username,
    status: updated.status,
    maxSessions: updated.maxSessions,
    createdAt: updated.createdAt,
    sessions: updated.sessions,
  };
};

/**
 * Admin "Generar QR ahora" — POST /admin/whatsapp-sessions/:sessionId/link
 * Mirrors the cashier startWhatsappLinkForSessionService but WITHOUT ownership check.
 * Admins can initiate the WhatsApp QR/pairing flow for any session.
 */
export const startWhatsappLinkForSessionAdminService = async (
  sessionId: string,
  phoneNumber: string,
) => {
  return _startWhatsappLinkForSessionUnsafe(sessionId, phoneNumber);
};
