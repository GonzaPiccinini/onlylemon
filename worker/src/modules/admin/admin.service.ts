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
  getConvertedLeadsByConvertedAtRange,
  getLeadsByDateRange,
  getSessionActivitiesByDateRange,
  listCashiers,
  getCashierById,
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
}) => ({
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
});

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
  const leads = await getLeadsByDateRange(
    range.from,
    range.to,
    query.cashierId,
  );
  const activities = await getSessionActivitiesByDateRange(
    range.from,
    range.to,
    query.cashierId,
  );

  const notContacted = leads.filter(
    (lead) => lead.status === 'NOT_CONTACTED',
  ).length;
  const contacted = leads.filter((lead) => lead.status === 'CONTACTED').length;
  const converted = leads.filter((lead) => lead.status === 'CONVERTED').length;
  // EXPIRED was removed in meta-conversions-refactor migration; always 0 for compat shim
  const expiredLeads = 0;
  const totalLeads = notContacted + contacted + converted;

  // NOTE: totalConvertedValue and averageConversionHours now require Conversion rows
  // (Lead.amount and Lead.convertedAt were dropped). These will be updated in M2.
  const totalConvertedValue = 0;
  const averageConvertedValue = 0;
  const averageConversionHours = 0;

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
  const leads = await getLeadsByDateRange(
    range.from,
    range.to,
    query.cashierId,
  );
  const activities = await getSessionActivitiesByDateRange(
    range.from,
    range.to,
    query.cashierId,
  );

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
      // NOTE: Lead.amount was dropped in meta-conversions-refactor. convertedValue will be
      // updated in M2 to sum from Conversion rows.
    }

    // EXPIRED was removed in meta-conversions-refactor; expiredLeads stays at 0 (compat shim)
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

// NOTE: groupConvertedLeadsByDay and getFundsSeriesService use Lead.convertedAt and
// Lead.amount which were dropped in meta-conversions-refactor migration.
// These functions are stubs until M2 reimplements them against Conversion rows.
export const groupConvertedLeadsByDay = (
  leads: Array<{ createdAt: Date }>,
): Array<{ date: string; totalValue: number }> => {
  const grouped = new Map<string, number>();

  leads.forEach((lead) => {
    const day = formatArgentinaDayKey(lead.createdAt);
    grouped.set(day, (grouped.get(day) ?? 0));
  });

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, totalValue]) => ({ date, totalValue }));
};

export const getFundsSeriesService = async (query: DateRangeQuery) => {
  const range = toRange(query);
  const leads = await getConvertedLeadsByConvertedAtRange(
    range.from,
    range.to,
    query.cashierId,
  );

  return groupConvertedLeadsByDay(leads);
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
