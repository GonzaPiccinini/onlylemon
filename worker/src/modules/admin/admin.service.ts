import { hashPassword } from '../../utils/password.js';
import {
  createCashier,
  createLanding,
  disableCashier,
  getCashierLandings,
  getAddFundsByDateRange,
  getSessionActivitiesByDateRange,
  listLandings,
  listCashiers,
  replaceCashierLandings,
  setLandingStatus,
  updateLanding,
  updateCashier,
} from './admin.repository.js';
import type { DateRangeQuery } from './admin.types.js';

const toRange = (query: DateRangeQuery) => ({
  from: new Date(`${query.from}T00:00:00.000Z`),
  to: new Date(`${query.to}T23:59:59.999Z`),
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
  input: { name: string; username: string },
) => {
  const updated = await updateCashier(cashierId, input);
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
  const disabled = await disableCashier(cashierId);
  return {
    id: disabled.id,
    name: disabled.user.name,
    username: disabled.user.username,
    status: disabled.status,
    createdAt: disabled.createdAt,
    landings: disabled.landings.map((entry) => toLandingDto(entry.landing)),
  };
};

export const getSummaryService = async (query: DateRangeQuery) => {
  const range = toRange(query);
  const addFunds = await getAddFundsByDateRange(range.from, range.to, query.cashierId);
  const activities = await getSessionActivitiesByDateRange(range.from, range.to, query.cashierId);

  const totalAddedFunds = addFunds.reduce((acc, item) => acc + toNumber(item.amount), 0);
  const totalOperations = addFunds.length;

  const totalActiveMinutes = activities.reduce((acc, item) => {
    if (!item.endedAt) {
      return acc;
    }

    return acc + (item.endedAt.getTime() - item.createdAt.getTime()) / 1000 / 60;
  }, 0);

  const uniqueClients = new Set(addFunds.map((item) => item.userName));
  const adsClients = new Set(
    addFunds.filter((item) => item.chat.fromAds).map((item) => item.userName),
  );

  return {
    totalAddedFunds,
    totalOperations,
    totalActiveHours: totalActiveMinutes / 60,
    totalClients: uniqueClients.size,
    adsClients: adsClients.size,
    adsClientsPercentage:
      uniqueClients.size === 0 ? 0 : (adsClients.size / uniqueClients.size) * 100,
  };
};

export const getCashierStatsService = async (query: DateRangeQuery) => {
  const range = toRange(query);
  const addFunds = await getAddFundsByDateRange(range.from, range.to, query.cashierId);
  const activities = await getSessionActivitiesByDateRange(range.from, range.to, query.cashierId);

  const grouped = new Map<
    string,
    {
      cashierId: string;
      cashierName: string;
      addedFundsTotal: number;
      operationsCount: number;
      activeMinutes: number;
      totalClients: Set<string>;
      adsClients: Set<string>;
    }
  >();

  addFunds.forEach((item) => {
    const cashierId = item.chat.cashierId;
    const cashierName = item.chat.cashier.user.name;

    if (!grouped.has(cashierId)) {
      grouped.set(cashierId, {
        cashierId,
        cashierName,
        addedFundsTotal: 0,
        operationsCount: 0,
        activeMinutes: 0,
        totalClients: new Set<string>(),
        adsClients: new Set<string>(),
      });
    }

    const current = grouped.get(cashierId);
    if (!current) {
      return;
    }

    current.addedFundsTotal += toNumber(item.amount);
    current.operationsCount += 1;
    current.totalClients.add(item.userName);
    if (item.chat.fromAds) {
      current.adsClients.add(item.userName);
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
        addedFundsTotal: 0,
        operationsCount: 0,
        activeMinutes: 0,
        totalClients: new Set<string>(),
        adsClients: new Set<string>(),
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
    addedFundsTotal: entry.addedFundsTotal,
    operationsCount: entry.operationsCount,
    activeHours: entry.activeMinutes / 60,
    adsClients: entry.adsClients.size,
    totalClients: entry.totalClients.size,
    adsClientsPercentage:
      entry.totalClients.size === 0
        ? 0
        : (entry.adsClients.size / entry.totalClients.size) * 100,
  }));
};

export const getFundsSeriesService = async (query: DateRangeQuery) => {
  const range = toRange(query);
  const addFunds = await getAddFundsByDateRange(range.from, range.to, query.cashierId);

  const grouped = new Map<string, number>();

  addFunds.forEach((item) => {
    const day = item.createdAt.toISOString().slice(0, 10);
    grouped.set(day, (grouped.get(day) ?? 0) + toNumber(item.amount));
  });

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, totalAmount]) => ({ date, totalAmount }));
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

export const replaceCashierLandingsService = async (
  cashierId: string,
  landingIds: string[],
) => {
  const items = await replaceCashierLandings(cashierId, landingIds);
  return items.map((item) => toLandingDto(item.landing));
};
