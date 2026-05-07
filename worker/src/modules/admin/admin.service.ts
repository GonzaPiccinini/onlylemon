import { hashPassword } from '../../utils/password.js';
import type { UpdateAdminAccountInput } from './admin.types.js';
import { deleteSession, getSessions } from '../../integrations/waha/client.js';
import { emitCashierRuntimeStateChanged } from '../cashier/runtime-events.js';
import {
  createCashier,
  createLanding,
  disableCashier,
  enableCashier,
  getCashierLandings,
  getConversionsByDateRange,
  getConversionsWithLeadByDateRange,
  getLeadsByDateRange,
  getSessionActivitiesByDateRange,
  listCashiers,
  getCashierById,
  listConversionsAdmin,
  listLandings,
  listLeads,
  replaceCashierLandings,
  setLandingStatus,
  updateAdminAccount,
  updateCashier,
  updateLanding,
} from './admin.repository.js';
import {
  finishCurrentSessionActivity,
  getCurrentSessionActivity,
  updateCashierWhatsappLink,
} from '../cashier/cashier.repository.js';
import type { DateRangeQuery, LeadsFilterQuery } from './admin.types.js';
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

export const toLeadDto = (lead: {
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
}) => {
  const timeline: Array<{ status: 'NOT_CONTACTED' | 'CONTACTED' | 'CONVERTED'; at: Date }> = [
    { status: 'NOT_CONTACTED', at: lead.createdAt },
  ];
  if (lead.contactedAt) {
    timeline.push({ status: 'CONTACTED', at: lead.contactedAt });
  }
  const firstConversion = lead.conversions?.[0];
  if (firstConversion?.createdAt) {
    timeline.push({ status: 'CONVERTED', at: firstConversion.createdAt });
  }
  timeline.sort((a, b) => a.at.getTime() - b.at.getTime());

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
  };
};

const buildWahaStatusByName = async (): Promise<Map<string, string>> => {
  try {
    const sessions = await getSessions();
    return new Map(sessions.map((session) => [session.name, session.status]));
  } catch {
    return new Map();
  }
};

export const listCashiersService = async () => {
  const cashiers = await listCashiers();
  const wahaStatusByName = await buildWahaStatusByName();

  return cashiers.map((cashier) => {
    const activeActivity = cashier.activity[0] ?? null;
    const hasActiveWorkSession = activeActivity !== null;
    const wahaStatus = cashier.sessionName
      ? wahaStatusByName.get(cashier.sessionName) ?? 'UNLINKED'
      : 'UNLINKED';
    const canOperateLeads =
      cashier.status === 'ACTIVE' &&
      Boolean(cashier.sessionName) &&
      wahaStatus === 'WORKING';

    return {
      id: cashier.id,
      name: cashier.user.name,
      username: cashier.user.username,
      status: cashier.status,
      createdAt: cashier.createdAt,
      landings: cashier.landings.map((entry) => toLandingDto(entry.landing)),
      hasActiveWorkSession,
      sessionStartedAt: activeActivity?.createdAt ?? null,
      wahaStatus,
      canOperateLeads,
    };
  });
};

export const createCashierService = async (input: {
  name: string;
  username: string;
  password: string;
}) => {
  const created = await createCashier({
    ...input,
    password: hashPassword(input.password),
  });

  return {
    id: created.id,
    name: created.user.name,
    username: created.user.username,
    status: created.status,
    createdAt: created.createdAt,
    landings: [],
  };
};

export const updateCashierService = async (
  cashierId: string,
  input: { name: string; username: string; password?: string },
) => {
  const updated = await updateCashier(cashierId, {
    ...input,
    ...(input.password ? { password: hashPassword(input.password) } : {}),
  });
  if (!updated) {
    return null;
  }

  return {
    id: updated.id,
    name: updated.user.name,
    username: updated.user.username,
    status: updated.status,
    createdAt: updated.createdAt,
    landings: updated.landings.map((entry) => toLandingDto(entry.landing)),
  };
};

export const disableCashierService = async (cashierId: string) => {
  const now = new Date();
  const cashier = await getCashierById(cashierId);

  if (cashier?.sessionName) {
    try {
      await deleteSession(cashier.sessionName);
    } catch {
      // best effort cleanup on WAHA side
    }
  }

  await Promise.all([
    finishCurrentSessionActivity(cashierId, now),
    updateCashierWhatsappLink(cashierId, {
      sessionName: null,
      whatsappPhoneNumber: null,
      whatsappLinkRefreshCount: 0,
      whatsappLinkUpdatedAt: now,
    }),
  ]);

  const disabled = await disableCashier(cashierId);
  emitCashierRuntimeStateChanged(cashierId);

  return {
    id: disabled.id,
    name: disabled.user.name,
    username: disabled.user.username,
    status: disabled.status,
    createdAt: disabled.createdAt,
    landings: disabled.landings.map((entry) => toLandingDto(entry.landing)),
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
    createdAt: enabled.createdAt,
    landings: enabled.landings.map((entry) => toLandingDto(entry.landing)),
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

export const getFundsSeriesService = async (query: DateRangeQuery) => {
  const range = toRange(query);
  const conversions = await getConversionsByDateRange(
    range.from,
    range.to,
    query.cashierId,
  );

  return groupConversionsByDay(conversions);
};

export const listLeadsService = async (filters: LeadsFilterQuery) => {
  const leads = await listLeads(filters);
  return leads.map(toLeadDto);
};

export const listLandingsService = async () => {
  const landings = await listLandings();
  return landings.map(toLandingDto);
};

export const createLandingService = async (input: {
  url: string;
  metaPixelId: string;
  metaAccessToken: string;
}) => {
  const landing = await createLanding(input);
  return toLandingDto(landing);
};

export const updateLandingService = async (
  landingId: string,
  input: {
    url: string;
    metaPixelId: string;
    metaAccessToken?: string;
  },
) => {
  const landing = await updateLanding(landingId, input);
  return toLandingDto(landing);
};

export const setLandingStatusService = async (
  landingId: string,
  status: 'ACTIVE' | 'DISABLED',
) => {
  const landing = await setLandingStatus(landingId, status);
  return toLandingDto(landing);
};

export const listCashierLandingsService = async (cashierId: string) => {
  const items = await getCashierLandings(cashierId);
  return items.map((item) => toLandingDto(item.landing));
};

export const updateAdminAccountService = async (
  userId: string,
  input: UpdateAdminAccountInput,
) => {
  const updated = await updateAdminAccount(userId, {
    ...(input.username ? { username: input.username } : {}),
    ...(input.password ? { password: hashPassword(input.password) } : {}),
  });
  return { id: updated.id, name: updated.name, username: updated.username };
};

export const replaceCashierLandingsService = async (
  cashierId: string,
  landingIds: string[],
) => {
  const items = await replaceCashierLandings(cashierId, landingIds);
  return items.map((item) => toLandingDto(item.landing));
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
    phone: c.lead.phone,
    cashierId: c.lead.cashier?.id ?? null,
    cashierName: c.lead.cashier?.user.name ?? null,
    amount: c.amount,
    createdAt: c.createdAt,
  }));

  return { items, total, page, pageSize };
};
