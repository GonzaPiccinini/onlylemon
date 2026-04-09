export type Role = "ADMIN" | "CASHIER";

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
}

export interface AuthSession {
  token: string;
  user: User;
}

export type CashierStatus = "ACTIVE" | "DISABLED";
export type LandingStatus = "ACTIVE" | "DISABLED";

export interface Landing {
  id: string;
  url: string;
  metaPixelId: string;
  metaAccessTokenMasked: string;
  status: LandingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Cashier {
  id: string;
  name: string;
  username: string;
  status: CashierStatus;
  createdAt: string;
  landings: Landing[];
}

export interface Session {
  id: string;
  cashierId: string;
  cashierName: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  activeMinutes: number;
}

export interface AddFunds {
  id: string;
  cashierId: string;
  cashierName: string;
  userName: string;
  phoneId: string;
  phoneNumber: string;
  amount: number;
  fromAds: boolean;
  createdAt: string;
}

export interface ClientPhoneOption {
  phoneId: string;
  phoneNumber: string;
}

export interface StatsSummary {
  totalAddedFunds: number;
  totalOperations: number;
  totalActiveHours: number;
  totalClients: number;
  adsClients: number;
  adsClientsPercentage: number;
}

export interface CashierStats {
  cashierId: string;
  cashierName: string;
  addedFundsTotal: number;
  operationsCount: number;
  activeHours: number;
  adsClients: number;
  totalClients: number;
  adsClientsPercentage: number;
}

export interface FundsSeriesPoint {
  date: string;
  totalAmount: number;
}

export interface DateRangeFilters {
  from: string;
  to: string;
  cashierId?: string;
}

export interface CreateCashierInput {
  name: string;
  username: string;
  password: string;
}

export interface UpdateCashierInput {
  name: string;
  username: string;
}

export interface CreateLandingInput {
  url: string;
  metaPixelId: string;
  metaAccessToken: string;
}

export interface UpdateLandingInput {
  url: string;
  metaPixelId: string;
  metaAccessToken?: string;
}

export interface AddFundsInput {
  userName: string;
  phoneId: string;
  phoneNumber: string;
  amount: number;
}
