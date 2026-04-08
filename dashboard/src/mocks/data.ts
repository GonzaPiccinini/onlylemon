import { addDays, differenceInMinutes, format, isWithinInterval, parseISO } from "date-fns";
import type {
  AddFunds,
  Cashier,
  CashierStats,
  ClientPhoneOption,
  DateRangeFilters,
  Session,
  StatsSummary,
  User,
} from "@/types/domain";

interface MockUserCredentials {
  id: string;
  name: string;
  username: string;
  password: string;
  role: User["role"];
  cashierId?: string;
}

const now = new Date();

const credentials: MockUserCredentials[] = [
  {
    id: "u-admin-1",
    name: "Admin Lemon",
    username: "admin",
    password: "admin123",
    role: "ADMIN",
  },
  {
    id: "u-cashier-1",
    name: "Cajera Sofia",
    username: "cashier",
    password: "cashier123",
    role: "CASHIER",
    cashierId: "cashier-1",
  },
  {
    id: "u-cashier-2",
    name: "Cajero Martin",
    username: "martin",
    password: "cashier123",
    role: "CASHIER",
    cashierId: "cashier-2",
  },
];

let cashiers: Cashier[] = [
  {
    id: "cashier-1",
    name: "Sofia Rojas",
    username: "cashier",
    status: "ACTIVE",
    createdAt: addDays(now, -30).toISOString(),
  },
  {
    id: "cashier-2",
    name: "Martin Sosa",
    username: "martin",
    status: "ACTIVE",
    createdAt: addDays(now, -23).toISOString(),
  },
  {
    id: "cashier-3",
    name: "Valentina Perez",
    username: "vale",
    status: "DISABLED",
    createdAt: addDays(now, -18).toISOString(),
  },
];

let sessions: Session[] = [
  {
    id: "session-1",
    cashierId: "cashier-1",
    cashierName: "Sofia Rojas",
    startDate: addDays(now, -2).toISOString(),
    endDate: addDays(now, -2 + 0.32).toISOString(),
    isActive: false,
    activeMinutes: 460,
  },
  {
    id: "session-2",
    cashierId: "cashier-2",
    cashierName: "Martin Sosa",
    startDate: addDays(now, -1).toISOString(),
    endDate: addDays(now, -1 + 0.30).toISOString(),
    isActive: false,
    activeMinutes: 430,
  },
];

let addFundsOperations: AddFunds[] = [
  {
    id: "fund-1",
    cashierId: "cashier-1",
    cashierName: "Sofia Rojas",
    clientName: "Nicolas Diaz",
    phoneId: "phone-1",
    phoneNumber: "+54 9 11 4444-1212",
    amount: 22000,
    fromAds: true,
    createdAt: addDays(now, -6).toISOString(),
  },
  {
    id: "fund-2",
    cashierId: "cashier-1",
    cashierName: "Sofia Rojas",
    clientName: "Romina Varela",
    phoneId: "phone-2",
    phoneNumber: "+54 9 11 3211-9988",
    amount: 18000,
    fromAds: false,
    createdAt: addDays(now, -4).toISOString(),
  },
  {
    id: "fund-3",
    cashierId: "cashier-2",
    cashierName: "Martin Sosa",
    clientName: "Pablo Gil",
    phoneId: "phone-3",
    phoneNumber: "+54 9 11 7777-2020",
    amount: 25000,
    fromAds: true,
    createdAt: addDays(now, -3).toISOString(),
  },
  {
    id: "fund-4",
    cashierId: "cashier-2",
    cashierName: "Martin Sosa",
    clientName: "Luz Rey",
    phoneId: "phone-4",
    phoneNumber: "+54 9 11 8888-4545",
    amount: 12000,
    fromAds: false,
    createdAt: addDays(now, -1).toISOString(),
  },
];

const clientPhones: ClientPhoneOption[] = [
  { phoneId: "phone-1", phoneNumber: "+54 9 11 4444-1212" },
  { phoneId: "phone-2", phoneNumber: "+54 9 11 3211-9988" },
  { phoneId: "phone-3", phoneNumber: "+54 9 11 7777-2020" },
  { phoneId: "phone-4", phoneNumber: "+54 9 11 8888-4545" },
  { phoneId: "phone-5", phoneNumber: "+54 9 11 6767-8181" },
];

const generateId = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export const getCredentialsByUsername = (username: string) =>
  credentials.find((entry) => entry.username === username);

export const getCredentialsById = (id: string) =>
  credentials.find((entry) => entry.id === id);

export const toSafeUser = (entry: MockUserCredentials): User => ({
  id: entry.id,
  name: entry.name,
  username: entry.username,
  role: entry.role,
});

export const listCashiers = (): Cashier[] => [...cashiers];

export const createCashier = (input: {
  name: string;
  username: string;
  password: string;
}): Cashier => {
  const cashier: Cashier = {
    id: generateId("cashier"),
    name: input.name,
    username: input.username,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  };

  const user: MockUserCredentials = {
    id: generateId("u-cashier"),
    name: input.name,
    username: input.username,
    password: input.password,
    role: "CASHIER",
    cashierId: cashier.id,
  };

  cashiers = [cashier, ...cashiers];
  credentials.push(user);
  return cashier;
};

export const updateCashier = (
  cashierId: string,
  input: { name: string; username: string },
): Cashier | null => {
  const target = cashiers.find((cashier) => cashier.id === cashierId);
  if (!target) {
    return null;
  }

  target.name = input.name;
  target.username = input.username;

  const credential = credentials.find((entry) => entry.cashierId === cashierId);
  if (credential) {
    credential.name = input.name;
    credential.username = input.username;
  }

  sessions = sessions.map((session) =>
    session.cashierId === cashierId
      ? { ...session, cashierName: input.name }
      : session,
  );

  addFundsOperations = addFundsOperations.map((operation) =>
    operation.cashierId === cashierId
      ? { ...operation, cashierName: input.name }
      : operation,
  );

  return { ...target };
};

export const disableCashier = (cashierId: string): boolean => {
  const target = cashiers.find((cashier) => cashier.id === cashierId);
  if (!target) {
    return false;
  }

  target.status = "DISABLED";
  return true;
};

const inRange = (isoDate: string, from: string, to: string): boolean => {
  const date = parseISO(isoDate);
  return isWithinInterval(date, {
    start: parseISO(`${from}T00:00:00`),
    end: parseISO(`${to}T23:59:59`),
  });
};

const filterSessions = (filters: DateRangeFilters): Session[] =>
  sessions.filter(
    (session) =>
      inRange(session.startDate, filters.from, filters.to) &&
      (!filters.cashierId || session.cashierId === filters.cashierId),
  );

const filterFunds = (filters: DateRangeFilters): AddFunds[] =>
  addFundsOperations.filter(
    (operation) =>
      inRange(operation.createdAt, filters.from, filters.to) &&
      (!filters.cashierId || operation.cashierId === filters.cashierId),
  );

export const getSummary = (filters: DateRangeFilters): StatsSummary => {
  const funds = filterFunds(filters);
  const selectedSessions = filterSessions(filters);
  const totalAddedFunds = funds.reduce((acc, operation) => acc + operation.amount, 0);
  const totalOperations = funds.length;
  const totalActiveHours =
    selectedSessions.reduce((acc, session) => acc + session.activeMinutes, 0) / 60;
  const totalClients = new Set(funds.map((operation) => operation.clientName)).size;
  const adsClients = new Set(
    funds.filter((operation) => operation.fromAds).map((operation) => operation.clientName),
  ).size;

  return {
    totalAddedFunds,
    totalOperations,
    totalActiveHours,
    totalClients,
    adsClients,
    adsClientsPercentage: totalClients === 0 ? 0 : (adsClients / totalClients) * 100,
  };
};

export const getCashierStats = (filters: DateRangeFilters): CashierStats[] => {
  const selectedCashiers =
    filters.cashierId
      ? cashiers.filter((cashier) => cashier.id === filters.cashierId)
      : cashiers;

  return selectedCashiers.map((cashier) => {
    const cashierFunds = filterFunds({ ...filters, cashierId: cashier.id });
    const cashierSessions = filterSessions({ ...filters, cashierId: cashier.id });
    const totalClients = new Set(cashierFunds.map((operation) => operation.clientName)).size;
    const adsClients = new Set(
      cashierFunds
        .filter((operation) => operation.fromAds)
        .map((operation) => operation.clientName),
    ).size;

    return {
      cashierId: cashier.id,
      cashierName: cashier.name,
      addedFundsTotal: cashierFunds.reduce((acc, operation) => acc + operation.amount, 0),
      operationsCount: cashierFunds.length,
      activeHours:
        cashierSessions.reduce((acc, session) => acc + session.activeMinutes, 0) / 60,
      adsClients,
      totalClients,
      adsClientsPercentage: totalClients === 0 ? 0 : (adsClients / totalClients) * 100,
    };
  });
};

export const getFundsSeries = (filters: DateRangeFilters) => {
  const funds = filterFunds(filters);
  const grouped = new Map<string, number>();

  funds.forEach((operation) => {
    const key = format(parseISO(operation.createdAt), "yyyy-MM-dd");
    grouped.set(key, (grouped.get(key) ?? 0) + operation.amount);
  });

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, totalAmount]) => ({ date, totalAmount }));
};

export const listSessionsForCashier = (cashierId: string): Session[] =>
  sessions
    .filter((session) => session.cashierId === cashierId)
    .sort((left, right) => right.startDate.localeCompare(left.startDate));

export const getCurrentSessionForCashier = (cashierId: string): Session | null =>
  sessions.find((session) => session.cashierId === cashierId && session.isActive) ?? null;

export const startSessionForCashier = (cashierId: string): Session | null => {
  const active = getCurrentSessionForCashier(cashierId);
  if (active) {
    return null;
  }

  const cashier = cashiers.find((entry) => entry.id === cashierId);
  if (!cashier || cashier.status === "DISABLED") {
    return null;
  }

  const session: Session = {
    id: generateId("session"),
    cashierId,
    cashierName: cashier.name,
    startDate: new Date().toISOString(),
    endDate: null,
    isActive: true,
    activeMinutes: 0,
  };

  sessions = [session, ...sessions];
  return session;
};

export const finishSessionForCashier = (cashierId: string): Session | null => {
  const current = getCurrentSessionForCashier(cashierId);
  if (!current) {
    return null;
  }

  current.endDate = new Date().toISOString();
  current.isActive = false;
  current.activeMinutes = differenceInMinutes(
    parseISO(current.endDate),
    parseISO(current.startDate),
  );

  return { ...current };
};

export const listAddFundsForCashier = (cashierId: string): AddFunds[] =>
  addFundsOperations
    .filter((operation) => operation.cashierId === cashierId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

export const listClientPhones = (): ClientPhoneOption[] => [...clientPhones];

export const addFundsForCashier = (
  cashierId: string,
  input: { userName: string; phoneId: string; phoneNumber: string; amount: number },
): AddFunds | null => {
  if (input.amount <= 0 || !input.phoneId || !input.phoneNumber) {
    return null;
  }

  const cashier = cashiers.find((entry) => entry.id === cashierId);
  if (!cashier || cashier.status === "DISABLED") {
    return null;
  }

  const operation: AddFunds = {
    id: generateId("fund"),
    cashierId,
    cashierName: cashier.name,
    clientName: input.userName,
    phoneId: input.phoneId,
    phoneNumber: input.phoneNumber,
    amount: input.amount,
    fromAds: Math.random() > 0.5,
    createdAt: new Date().toISOString(),
  };

  addFundsOperations = [operation, ...addFundsOperations];
  return operation;
};
