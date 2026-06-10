export type Role = "ADMIN" | "CASHIER" | "SUPER_ADMIN";

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
  refreshToken: string;
  expiresIn: number;
  user: User;
}

export type CashierStatus = "ACTIVE" | "DISABLED";
export type LandingStatus = "ACTIVE" | "DISABLED";
export type LeadStatus = "NOT_CONTACTED" | "CONTACTED" | "CONVERTED";
export type LeadFilterStatus = LeadStatus | "RECARGA";

export interface Landing {
  id: string;
  url: string;
  metaPixelId: string;
  metaAccessTokenMasked: string;
  status: LandingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsappSession {
  id: string;
  cashierId: string;
  sessionName: string;
  whatsappPhoneNumber: string | null;
  alias?: string | null;
  refreshCount: number;
  lastRefreshAt: string | null;
  wahaStatus?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Cashier {
  id: string;
  name: string;
  username: string;
  status: CashierStatus;
  createdAt: string;
  maxSessions: number;
  sessions: WhatsappSession[];
  workingSessionsCount?: number;
  hasActiveWorkSession?: boolean;
  sessionStartedAt?: string | null;
  wahaStatus?: WahaStatus;
  canOperateLeads?: boolean;
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

export interface CashierWhatsappSessionState {
  id: string;
  sessionName: string;
  status: string;
  phone: string | null;
  refreshCount: number;
  lastRefreshAt: string | null;
}

export interface CashierRuntimeState {
  cashierId: string;
  cashierStatus: CashierStatus;
  maxSessions: number;
  // Multi-session fields (new)
  sessions: CashierWhatsappSessionState[];
  anyWorking: boolean;
  // Legacy single-session fields (backward compat)
  sessionName: string;
  wahaStatus: WahaStatus;
  canOperateLeads: boolean;
  hasActiveWorkSession: boolean;
}

export interface MyWhatsappSession {
  id: string;
  sessionName: string;
  whatsappPhoneNumber: string | null;
  alias?: string | null;
  wahaStatus: string;
  refreshCount: number;
  lastRefreshAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface WhatsappSessionStatus {
  status: string;
  linked: boolean;
  sessionName: string;
  phone: string | null;
}

export interface LeadStatusTimelineEntry {
  status: LeadStatus;
  at: string;
}

export interface LeadConversionEntry {
  at: string;
}

export interface Lead {
  id: string;
  code: string;
  adCode?: string | null;
  status: LeadStatus;
  phone: string | null;
  metaPixelId: string;
  contactedAt: string | null;
  createdAt: string;
  activityAt?: string;
  cashierId?: string | null;
  cashierName?: string | null;
  cashierUsername?: string | null;
  statusTimeline: LeadStatusTimelineEntry[];
  conversionsCount?: number;
  firstConversionAt?: string | null;
  lastConversionAt?: string | null;
  lastStatusChangeAt?: string;
}

export interface LeadHistoryPage {
  id: string;
  createdAt: string;
  contactedAt: string | null;
  conversions: LeadConversionEntry[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  firstConversionAt: string | null;
}

export interface Conversion {
  id: string;
  leadId: string;
  code: string;
  adCode?: string | null;
  phone: string | null;
  amount: string | number;
  createdAt: string;
  cashierId?: string | null;
  cashierName?: string | null;
}

export interface ConversionsTotals {
  totalAmount: number;
  count: number;
  averageAmount: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StatsSummary {
  totalLeads: number;
  notContactedLeads: number;
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
  count: number;
  sum: number;
}

export interface AdminFundsSeries {
  grossByConversionDate: FundsSeriesPoint[];
  incomeByContactedDate: FundsSeriesPoint[];
  firstChargesByDate: FundsSeriesPoint[];
}

export interface DateRangeFilters {
  from: string;
  to: string;
  cashierId?: string;
}

export interface LeadsFilters {
  statuses?: LeadFilterStatus[];
  cashierId?: string;
  cashierIds?: string[];
  adCode?: string;
  code?: string;
  phone?: string;
}

export interface ConversionsFilters {
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
  phone?: string;
  code?: string;
  adCode?: string;
  cashierIds?: string[];
  amountMin?: number;
  amountMax?: number;
}

export interface CashierConversionsFilters {
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
  phone?: string;
  code?: string;
  amountMin?: number;
  amountMax?: number;
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

export interface UpdateCashierMaxSessionsInput {
  maxSessions: number;
}

export interface ReplaceSessionLandingsInput {
  landingIds: string[];
}

export interface LandingFallbackPhone {
  id: string;
  landingId: string;
  phone: string;
  label: string | null;
  order: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLandingFallbackPhoneInput {
  phone: string;
  label?: string;
  order?: number;
}

export interface UpdateLandingFallbackPhoneInput {
  phone?: string;
  label?: string | null;
  order?: number | null;
}

export interface CreateLandingInput {
  url: string;
  metaPixelId: string;
  metaAccessToken: string;
  fallbackPhones: { phone: string; label?: string; order?: number }[];
}

export interface UpdateLandingInput {
  url: string;
  metaPixelId: string;
  metaAccessToken?: string;
  fallbackPhones?: { phone: string; label?: string; order?: number }[];
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

export type AdminStatus = "ACTIVE" | "DISABLED";

export interface AdminListItem {
  id: string;
  name: string;
  username: string;
  role: Role;
  status: AdminStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAdminInput {
  name: string;
  username: string;
  password: string;
}

export interface UpdateAdminInput {
  name?: string;
  username?: string;
  password?: string;
}

export interface SetupStatusResponse {
  needsSetup: boolean;
}

export interface SetupInput {
  name: string;
  username: string;
  password: string;
}
