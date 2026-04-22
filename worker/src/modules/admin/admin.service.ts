import { hashPassword } from '../../utils/password.js';
import type { UpdateAdminAccountInput } from './admin.types.js';
import { deleteSession } from '../../integrations/waha/client.js';
import { emitCashierRuntimeStateChanged } from '../cashier/runtime-events.js';
import {
  createCashier,
  createLanding,
  disableCashier,
  enableCashier,
  getCashierLandings,
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
  status: 'NOT_CONTACTED' | 'CONTACTED' | 'CONVERTED' | 'EXPIRED';
  phone: string | null;
  amount: unknown | null;
  metaPixelId: string;
  contactedAt: Date | null;
  convertedAt: Date | null;
  expiresAt: Date;
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
  amount: lead.amount === null ? null : Number(lead.amount),
  metaPixelId: lead.metaPixelId,
  contactedAt: lead.contactedAt,
  convertedAt: lead.convertedAt,
  expiresAt: lead.expiresAt,
  createdAt: lead.createdAt,
  activityAt: lead.updateAt,
  cashierId: lead.cashier?.id ?? null,
  cashierName: lead.cashier?.user.name ?? null,
  cashierUsername: lead.cashier?.user.username ?? null,
});

export const listCashiersService = async () => {
  const cashiers = await listCashiers();
  return cashiers.map((cashier) => ({
    id: cashier.id,
    name: cashier.user.name,
    username: cashier.user.username,
    status: cashier.status,
    createdAt: cashier.createdAt,
    landings: cashier.landings.map((entry) => toLandingDto(entry.landing)),
  }));
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

  const contacted = leads.filter((lead) => lead.status === 'CONTACTED').length;
  const converted = leads.filter((lead) => lead.status === 'CONVERTED').length;
  const expired = leads.filter((lead) => lead.status === 'EXPIRED').length;

  const totalConvertedValue = leads
    .filter((lead) => lead.status === 'CONVERTED' && lead.amount !== null)
    .reduce((acc, lead) => acc + toNumber(lead.amount), 0);

  const averageConvertedValue =
    converted === 0 ? 0 : totalConvertedValue / converted;

  const averageConversionHours = (() => {
    const convertedWithContact = leads.filter(
      (lead) =>
        lead.status === 'CONVERTED' && lead.contactedAt && lead.convertedAt,
    );

    if (convertedWithContact.length === 0) {
      return 0;
    }

    const totalHours = convertedWithContact.reduce((acc, lead) => {
      const contactedAt = lead.contactedAt;
      const convertedAt = lead.convertedAt;
      if (!contactedAt || !convertedAt) {
        return acc;
      }

      return (
        acc + (convertedAt.getTime() - contactedAt.getTime()) / 1000 / 60 / 60
      );
    }, 0);

    return totalHours / convertedWithContact.length;
  })();

  const totalActiveMinutes = activities.reduce((acc, item) => {
    if (!item.endedAt) {
      return acc;
    }

    return (
      acc + (item.endedAt.getTime() - item.createdAt.getTime()) / 1000 / 60
    );
  }, 0);

  return {
    totalLeads: contacted + converted,
    contactedLeads: contacted,
    convertedLeads: converted,
    expiredLeads: expired,
    conversionRate:
      contacted + converted === 0
        ? 0
        : (converted / (contacted + converted)) * 100,
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
      if (lead.amount !== null) {
        current.convertedValue += toNumber(lead.amount);
      }
    }

    if (lead.status === 'EXPIRED') {
      current.expiredLeads += 1;
    }
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

export const getFundsSeriesService = async (query: DateRangeQuery) => {
  const range = toRange(query);
  const leads = await getLeadsByDateRange(
    range.from,
    range.to,
    query.cashierId,
  );

  const grouped = new Map<string, number>();

  leads
    .filter((lead) => lead.status === 'CONVERTED' && lead.amount !== null)
    .forEach((lead) => {
      const dateSource = lead.convertedAt ?? lead.createdAt;
      const day = formatArgentinaDayKey(dateSource);
      grouped.set(day, (grouped.get(day) ?? 0) + toNumber(lead.amount));
    });

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, totalValue]) => ({ date, totalValue }));
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
