export type Role = "ADMIN" | "CASHIER";

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  cashierId?: string;
  sessionName?: string | null;
}

export interface AuthSession {
  token: string;
  user: User;
}

export type CashierStatus = "ACTIVE" | "DISABLED";
export type LandingStatus = "ACTIVE" | "DISABLED";
export type LeadStatus = "NOT_CONTACTED" | "CONTACTED" | "CONVERTED" | "EXPIRED";

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

export interface WhatsappLinkState {
  needsLink: boolean;
  sessionName: string;
  refreshCount: number;
  maxRefresh: number;
  status: string;
}

export interface WhatsappLinkArtifacts {
  sessionName: string;
  pairingCode: string | null;
  qr: string | null;
  refreshCount: number;
  maxRefresh: number;
  nextRefreshInSeconds: number;
}

export interface WhatsappLinkStatus {
  sessionName: string;
  status: string;
  linked: boolean;
}

export type WahaStatus =
  | 'UNLINKED'
  | 'STOPPED'
  | 'STARTING'
  | 'SCAN_QR_CODE'
  | 'WORKING'
  | 'FAILED';

export interface CashierRuntimeState {
  cashierId: string;
  cashierStatus: CashierStatus;
  sessionName: string;
  wahaStatus: WahaStatus;
  canOperateLeads: boolean;
  hasActiveWorkSession: boolean;
}

export interface Lead {
  id: string;
  code: string;
  status: LeadStatus;
  phone: string | null;
  amount: number | null;
  metaPixelId: string;
  contactedAt: string | null;
  convertedAt: string | null;
  expiresAt: string;
  createdAt: string;
  cashierId?: string | null;
  cashierName?: string | null;
  cashierUsername?: string | null;
}

export interface StatsSummary {
  totalLeads: number;
  contactedLeads: number;
  convertedLeads: number;
  expiredLeads: number;
  conversionRate: number;
  totalConvertedValue: number;
  averageConvertedValue: number;
  averageConversionHours: number;
  totalActiveHours: number;
}

export interface CashierStats {
  cashierId: string;
  cashierName: string;
  totalLeads: number;
  contactedLeads: number;
  convertedLeads: number;
  expiredLeads: number;
  conversionRate: number;
  convertedValue: number;
  activeHours: number;
}

export interface FundsSeriesPoint {
  date: string;
  totalValue: number;
}

export interface DateRangeFilters {
  from: string;
  to: string;
  cashierId?: string;
}

export interface LeadsFilters {
  status?: LeadStatus;
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
  password?: string;
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

export interface ConvertLeadInput {
  amount: number;
}

export interface UpdateCashierAccountInput {
  username?: string;
  password?: string;
}

export interface UpdateAdminAccountInput {
  username?: string;
  password?: string;
}
