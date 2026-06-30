import { LeadStatus } from '../../generated/prisma/client.js';
import { prisma } from '../../persistence/prisma/client.js';
import { sendMetaConversion } from '../../integrations/leads/conversion.js';
import { loadConversionConfig } from '../system-settings/conversion-config.js';
import {
  createSessionIfNotExists,
  deleteSession,
  getSession,
  getSessionQr,
  requestSessionCode,
  startSession,
} from '../../integrations/waha/client.js';
import {
  createConversion,
  finishCurrentSessionActivity,
  findLeadByIdForCashier,
  finishSessionActivity,
  getCashierById,
  getCashierSession,
  getCurrentSessionActivity,
  listConversionsForCashier,
  listSessionActivities,
  searchLeadsForCashier,
  startSessionActivity,
  updateCashierAccount,
} from './cashier.repository.js';
import { hashPassword } from '../../utils/password.js';
import { emitCashierRuntimeStateChanged } from './runtime-events.js';
import { logger } from '../../lib/logger.js';
import {
  leadsConvertedTotal,
  leadConversionAmountArs,
} from '../../lib/metrics.js';
import {
  createSession as createWhatsappSession,
  deleteWhatsappSession,
  listSessionsByCashier,
  REFRESH_CAP,
  SESSION_CAP_REACHED,
} from './whatsapp-session.service.js';
import { getSetting } from '../system-settings/service.js';
import { SETTING_KEYS } from '../system-settings/keys.js';

const parseAmountSetting = (raw: string): number => {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Returns the admin-configured min/max conversion amount limits.
 * 0 on either field means "disabled" (no bound on that side).
 * Inject `getSettingFn` for unit testing; defaults to the live system-settings service.
 */
export const getConversionAmountLimits = async (
  getSettingFn: (key: string) => Promise<string> = getSetting,
): Promise<{ min: number; max: number }> => {
  const [minRaw, maxRaw] = await Promise.all([
    getSettingFn(SETTING_KEYS.AUTO_CONVERSION_MIN_AMOUNT),
    getSettingFn(SETTING_KEYS.AUTO_CONVERSION_MAX_AMOUNT),
  ]);
  return { min: parseAmountSetting(minRaw), max: parseAmountSetting(maxRaw) };
};

export const SESSION_NOT_OWNED = 'SESSION_NOT_OWNED';

const WHATSAPP_LINK_MAX_REFRESH = 3;
const WAHA_SESSION_READY_TIMEOUT_MS = 20000;
const WAHA_SESSION_READY_POLL_MS = 750;
const WAHA_MAX_SESSION_NAME_LENGTH = 54;


const toSessionDto = (item: {
  id: string;
  createdAt: Date;
  endedAt: Date | null;
}) => {
  const activeMinutes = item.endedAt
    ? (item.endedAt.getTime() - item.createdAt.getTime()) / 1000 / 60
    : 0;

  return {
    id: item.id,
    startDate: item.createdAt,
    endDate: item.endedAt,
    isActive: item.endedAt === null,
    activeMinutes,
  };
};

/**
 * Build statusTimeline from scalar timestamps + first Conversion createdAt.
 * Always includes NOT_CONTACTED; CONTACTED if contactedAt set; CONVERTED if any conversions.
 * Entries are ordered chronologically.
 */
export const toLeadDtoWithTimeline = (lead: {
  id: string;
  code: string;
  phone: string | null;
  status: LeadStatus;
  contactedAt: Date | null;
  createdAt: Date;
  conversions: Array<{ createdAt: Date }>;
}) => {
  const timeline: Array<{ status: 'NOT_CONTACTED' | 'CONTACTED' | 'CONVERTED'; at: Date }> = [
    { status: 'NOT_CONTACTED', at: lead.createdAt },
  ];
  if (lead.contactedAt) {
    timeline.push({ status: 'CONTACTED', at: lead.contactedAt });
  }
  if (lead.conversions[0]?.createdAt) {
    timeline.push({ status: 'CONVERTED', at: lead.conversions[0].createdAt });
  }
  timeline.sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    id: lead.id,
    code: lead.code,
    phone: lead.phone,
    status: lead.status,
    contactedAt: lead.contactedAt,
    createdAt: lead.createdAt,
    statusTimeline: timeline,
  };
};

const toLeadDto = (lead: {
  id: string;
  code: string;
  phone: string | null;
  status: LeadStatus;
  contactedAt: Date | null;
  createdAt: Date;
  conversions?: Array<{ createdAt: Date }>;
}) => ({
  id: lead.id,
  code: lead.code,
  phone: lead.phone,
  status: lead.status,
  contactedAt: lead.contactedAt,
  createdAt: lead.createdAt,
});

export const listSessionsService = async (cashierId: string) => {
  const cashier = await getCashierSession(cashierId);
  const activities = await listSessionActivities(cashier.id);

  return activities.map((activity) => ({
    ...toSessionDto(activity),
    cashierId,
    cashierName: cashier.user.name,
  }));
};

export const getCurrentSessionService = async (cashierId: string) => {
  const cashier = await getCashierSession(cashierId);
  const current = await getCurrentSessionActivity(cashier.id);

  if (!current) {
    return null;
  }

  return {
    ...toSessionDto(current),
    cashierId,
    cashierName: cashier.user.name,
  };
};

export const getCashierRuntimeStateService = async (cashierId: string) => {
  const cashier = await getCashierById(cashierId);
  if (!cashier) {
    throw new Error('CASHIER_NOT_FOUND');
  }

  const current = await getCurrentSessionActivity(cashier.id);

  // Multi-session: fetch all sessions and get live WAHA status for each
  const dbSessions = await listSessionsByCashier(cashier.id);

  const sessionStatuses = await Promise.all(
    dbSessions.map(async (s) => {
      let wahaStatus = 'STOPPED';
      if (s.sessionName) {
        try {
          const wahaSession = await getSession(s.sessionName);
          wahaStatus = wahaSession?.status ?? 'STOPPED';
        } catch {
          wahaStatus = 'STOPPED';
        }
      }
      return {
        id: s.id,
        sessionName: s.sessionName,
        status: wahaStatus,
        phone: s.whatsappPhoneNumber ?? null,
        refreshCount: s.refreshCount,
        lastRefreshAt: s.lastRefreshAt ?? null,
      };
    }),
  );

  const anyWorking = sessionStatuses.some((s) => s.status === 'WORKING');
  const canOperateLeads = cashier.status === 'ACTIVE' && anyWorking;

  // Legacy fields (backward compat for any remaining consumers)
  const firstSession = sessionStatuses[0] ?? null;
  const sessionName = firstSession?.sessionName ?? '';
  const wahaStatus = firstSession?.status ?? 'STOPPED';

  return {
    cashierId: cashier.id,
    cashierStatus: cashier.status,
    maxSessions: cashier.maxSessions,
    // Multi-session fields (new)
    sessions: sessionStatuses,
    anyWorking,
    // Legacy single-session fields (kept for backward compat)
    sessionName,
    wahaStatus,
    canOperateLeads,
    hasActiveWorkSession: Boolean(current),
  };
};

export const enforceCashierCanOperateLeadsService = async (cashierId: string) => {
  const runtime = await getCashierRuntimeStateService(cashierId);
  if (!runtime.canOperateLeads) {
    return {
      allowed: false as const,
      reason:
        runtime.cashierStatus !== 'ACTIVE'
          ? 'CASHIER_DISABLED'
          : !runtime.anyWorking
            ? 'WHATSAPP_NOT_WORKING'
            : 'WHATSAPP_NOT_LINKED',
      runtime,
    };
  }

  return {
    allowed: true as const,
    runtime,
  };
};

/**
 * B4 — processWhatsappSessionStatusService
 * Delegates to whatsapp-session.service for the full implementation.
 */
export const processWhatsappSessionStatusService = async (
  sessionName: string,
  status: string,
  occurredAt: Date,
) => {
  const { processWhatsappSessionStatusService: processSessionStatus } =
    await import('./whatsapp-session.service.js');
  return processSessionStatus(sessionName, status, occurredAt);
};

export const startSessionService = async (cashierId: string) => {
  const cashier = await getCashierSession(cashierId);
  const current = await getCurrentSessionActivity(cashier.id);
  if (current) {
    return null;
  }

  const activity = await startSessionActivity(cashier.id);
  emitCashierRuntimeStateChanged(cashier.id);
  return {
    ...toSessionDto(activity),
    cashierId,
    cashierName: cashier.user.name,
  };
};

export const finishSessionService = async (cashierId: string) => {
  const cashier = await getCashierSession(cashierId);
  const current = await getCurrentSessionActivity(cashier.id);
  if (!current) {
    return null;
  }

  const finished = await finishSessionActivity(current.id, new Date());
  emitCashierRuntimeStateChanged(cashier.id);
  return {
    ...toSessionDto(finished),
    cashierId,
    cashierName: cashier.user.name,
  };
};

const getSessionCandidateName = (cashierId: string) => `cashier-${cashierId}`;

const buildWhatsappSessionName = (cashierId: string) => {
  const compactCashierId = cashierId.replace(/-/g, '');
  const suffix = Date.now().toString(36);
  return `cashier-${compactCashierId}-${suffix}`;
};

const assertValidSessionName = (sessionName: string) => {
  if (sessionName.length > WAHA_MAX_SESSION_NAME_LENGTH) {
    throw new Error('WAHA_SESSION_NAME_TOO_LONG');
  }
};

const normalizePhoneNumber = (phoneNumber: string) =>
  phoneNumber.trim().replace(/^\+/, '');

const waitForSessionReadyForAuth = async (sessionName: string) => {
  const deadline = Date.now() + WAHA_SESSION_READY_TIMEOUT_MS;
  let restartAttempts = 0;

  while (Date.now() < deadline) {
    const session = await getSession(sessionName);
    const status = session?.status ?? 'UNLINKED';

    if (status === 'SCAN_QR_CODE' || status === 'WORKING') {
      return;
    }

    if (status === 'FAILED') {
      throw new Error('WAHA_SESSION_FAILED');
    }

    if (status === 'STOPPED' && restartAttempts < 2) {
      restartAttempts += 1;
      await startSession(sessionName);
    }

    await new Promise((resolve) => setTimeout(resolve, WAHA_SESSION_READY_POLL_MS));
  }

  throw new Error('WAHA_SESSION_NOT_READY');
};

const requestPairingCodeWithRetry = async (
  sessionName: string,
  phoneNumber: string,
  attempts = 3,
) => {
  let currentAttempt = 0;

  while (currentAttempt < attempts) {
    currentAttempt += 1;
    try {
      const pairingCode = await requestSessionCode(sessionName, phoneNumber);
      if (pairingCode) {
        return pairingCode;
      }
    } catch {
      // keep trying until attempts exhausted
    }

    if (currentAttempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }

  return null;
};

const ensureSessionIsRunningForAuth = async (sessionName: string) => {
  await createSessionIfNotExists(sessionName);
  await startSession(sessionName);
};

const requestWhatsappAuthArtifacts = async (
  sessionName: string,
  phoneNumber: string,
) => {
  await ensureSessionIsRunningForAuth(sessionName);
  await waitForSessionReadyForAuth(sessionName);

  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  const [pairingCodeResult, qrResult] = await Promise.allSettled([
    requestPairingCodeWithRetry(sessionName, normalizedPhone),
    getSessionQr(sessionName),
  ]);

  const pairingCode =
    pairingCodeResult.status === 'fulfilled' ? pairingCodeResult.value : null;
  const qr = qrResult.status === 'fulfilled' ? qrResult.value : null;

  if (!pairingCode && !qr) {
    throw new Error('WAHA_AUTH_ARTIFACTS_UNAVAILABLE');
  }

  return {
    sessionName,
    pairingCode,
    qr,
  };
};

export const getWhatsappLinkStateService = async (cashierId: string) => {
  const cashier = await getCashierSession(cashierId);
  // Use first session for legacy single-session link state view
  const firstSession = cashier.sessions[0] ?? null;
  const sessionName = firstSession?.sessionName ?? '';

  let wahaStatus: string | null = null;
  if (sessionName) {
    try {
      const session = await getSession(sessionName);
      wahaStatus = session?.status ?? null;
    } catch {
      wahaStatus = null;
    }
  }

  return {
    needsLink: !firstSession || !firstSession.whatsappPhoneNumber,
    sessionName,
    refreshCount: firstSession?.refreshCount ?? 0,
    maxRefresh: WHATSAPP_LINK_MAX_REFRESH,
    status: wahaStatus ?? 'UNLINKED',
  };
};

export const resetWhatsappLinkService = async (cashierId: string) => {
  // Reset refreshCount on all sessions for this cashier
  await prisma.whatsappSession.updateMany({
    where: { cashierId },
    data: { refreshCount: 0, lastRefreshAt: new Date() },
  });
  emitCashierRuntimeStateChanged(cashierId);
};

export const getWhatsappLinkStatusService = async (cashierId: string) => {
  const cashier = await getCashierSession(cashierId);
  const firstSession = cashier.sessions[0] ?? null;
  const sessionName = firstSession?.sessionName ?? '';

  if (!sessionName) {
    return {
      sessionName,
      status: 'UNLINKED',
      linked: false,
    };
  }

  const wahaSession = await getSession(sessionName);
  const status = wahaSession?.status ?? 'UNLINKED';

  return {
    sessionName,
    status,
    linked: status === 'WORKING',
  };
};

export const completeWhatsappLinkService = async (
  cashierId: string,
  sessionName: string,
) => {
  const wahaSession = await getSession(sessionName);
  if (!wahaSession || wahaSession.status !== 'WORKING') {
    return null;
  }

  // Upsert the WhatsappSession row to ensure it exists and has refreshCount reset
  await prisma.whatsappSession.upsert({
    where: { sessionName },
    update: { refreshCount: 0, lastRefreshAt: new Date() },
    create: { cashierId, sessionName, refreshCount: 0 },
  });

  emitCashierRuntimeStateChanged(cashierId);

  return {
    linked: true,
    sessionName,
    status: wahaSession.status,
  };
};


export const updateCashierAccountService = async (
  cashierId: string,
  input: {
    username?: string;
    password?: string;
  },
) => {
  const updated = await updateCashierAccount(cashierId, {
    ...(input.username ? { username: input.username } : {}),
    ...(input.password ? { password: await hashPassword(input.password) } : {}),
  });

  return {
    id: updated.id,
    name: updated.name,
    username: updated.username,
  };
};

// ---------------------------------------------------------------------------
// Batch 7 — createConversionService extended signature
// ---------------------------------------------------------------------------

type CreateConversionOptions = {
  /** Conversion source. Defaults to 'MANUAL' when not provided. */
  source?: 'MANUAL' | 'AUTO_OCR';
  /** WAHA message ID for idempotency (enforced via partial unique in DB). Default null. */
  sourceMessageId?: string | null;
};

type CreateConversionResult =
  | { kind: 'CREATED'; conversion: { id: string; leadId: string; amount: unknown; createdAt: Date } }
  | { kind: 'DUPLICATE'; sourceMessageId: string | null }
  | { kind: 'NOT_FOUND' }
  | { kind: 'INVALID_STATUS' }
  | { kind: 'PHONE_REQUIRED' };

/**
 * M2.2 / G3 — createConversionService
 *
 * Insert a Conversion row for the given lead.
 * - Validates cashier ownership.
 * - Validates lead status IN (CONTACTED, CONVERTED).
 * - Validates phone presence.
 * - Inserts Conversion (with optional source/sourceMessageId/cashierId) +
 *   flips lead status to CONVERTED (idempotent) in a transaction.
 * - Dispatches Meta Purchase + tier events outside the transaction.
 * - On P2002 (partial unique violation for AUTO_OCR dedup): returns {kind:'DUPLICATE'}.
 *   Meta CAPI is NOT fired and lead status is NOT changed on DUPLICATE.
 *
 * Backward-compatible: callers that pass no options get source='MANUAL', sourceMessageId=null.
 * Return shape changed from {kind:'OK'} → {kind:'CREATED'} — all callers updated in Batch 7.
 */
export const createConversionService = async (
  cashierId: string,
  leadId: string,
  amount: number,
  options: CreateConversionOptions = {},
): Promise<CreateConversionResult> => {
  const { source = 'MANUAL', sourceMessageId = null } = options;

  const lead = await findLeadByIdForCashier(leadId, cashierId);
  if (!lead) {
    return { kind: 'NOT_FOUND' };
  }

  if (lead.status !== 'CONTACTED' && lead.status !== 'CONVERTED') {
    return { kind: 'INVALID_STATUS' };
  }

  if (!lead.phone) {
    return { kind: 'PHONE_REQUIRED' };
  }

  // Denormalize cashierId from the lead (same cashier after ownership check,
  // but using lead.cashierId explicitly keeps the repo field accurate).
  const denormalizedCashierId = lead.cashierId ?? cashierId;

  let conversion: Awaited<ReturnType<typeof createConversion>>;

  try {
    conversion = await prisma.$transaction(async (tx) => {
      const created = await createConversion(tx as Parameters<typeof createConversion>[0], {
        leadId,
        amount,
        source,
        sourceMessageId,
        cashierId: denormalizedCashierId,
      });
      await tx.lead.update({
        where: { id: leadId },
        data: { status: 'CONVERTED' },
      });
      return created;
    });
  } catch (err) {
    const e = err as { code?: string };
    if (e?.code === 'P2002') {
      // Partial unique (cashierId, sourceMessageId) WHERE sourceMessageId IS NOT NULL hit.
      // This is an idempotent duplicate — not an error. Do NOT fire Meta CAPI.
      logger.info({
        event: 'auto_conversion_duplicate',
        leadId,
        cashierId,
        sourceMessageId,
      });
      return { kind: 'DUPLICATE', sourceMessageId };
    }
    throw err;
  }

  // Use the MetaPixel snapshot stored on the lead (pixelId = pixel NUMBER for CAPI label)
  const pixelLabel = lead.metaPixel?.pixelId ?? lead.metaPixelId;
  leadsConvertedTotal.labels(pixelLabel).inc();
  leadConversionAmountArs.labels(pixelLabel).observe(amount);
  logger.info({
    event: 'lead_converted',
    leadId: lead.id,
    cashierId,
    metaPixelId: pixelLabel,
    amount,
    source,
  });

  if (!lead.metaPixel) {
    logger.error({
      event: 'meta_pixel_snapshot_missing',
      leadId: lead.id,
    });

    return {
      kind: 'CREATED',
      conversion: {
        id: conversion.id,
        leadId: conversion.leadId,
        amount: conversion.amount,
        createdAt: conversion.createdAt,
      },
    };
  }

  const conversionConfig = await loadConversionConfig();

  const conversionResult = await sendMetaConversion(
    {
      phone: lead.phone,
      value: amount,
      fbc: lead.fbc,
      fbp: lead.fbp,
      userAgent: lead.userAgent,
      metaPixelId: lead.metaPixel.pixelId,
      metaAccessToken: lead.metaPixel.accessToken,
      eventId: conversion.id,
      eventSourceUrl: lead.eventSourceUrl,
      leadCode: lead.code,
    },
    conversionConfig,
  );

  if (!conversionResult.purchaseSent) {
    logger.error({
      event: 'meta_conversion_failed',
      leadId: lead.id,
      metaPixelId: pixelLabel,
      eventName: 'Purchase',
    });
  }

  if (conversionResult.highValueRequired && !conversionResult.highValueSent) {
    logger.error({
      event: 'meta_conversion_failed',
      leadId: lead.id,
      metaPixelId: pixelLabel,
      eventName: 'HighValueCustomer',
    });
  }

  for (const tier of conversionResult.tiers) {
    if (tier.required && !tier.sent) {
      logger.error({
        event: 'meta_conversion_failed',
        leadId: lead.id,
        metaPixelId: pixelLabel,
        eventName: tier.eventName,
      });
    }
  }

  return {
    kind: 'CREATED',
    conversion: {
      id: conversion.id,
      leadId: conversion.leadId,
      amount: conversion.amount,
      createdAt: conversion.createdAt,
    },
  };
};

/**
 * M2.3 — searchCashierLeadsService
 * Returns leads matching q (case-insensitive code, case-sensitive phone substring) scoped to cashier.
 * Empty q → [] immediately.
 */
export const searchCashierLeadsService = async (cashierId: string, q: string) => {
  if (!q) {
    return [];
  }
  const leads = await searchLeadsForCashier(cashierId, q);
  return leads.map(toLeadDtoWithTimeline);
};

type ConversionDto = {
  id: string;
  code: string;
  phone: string | null;
  amount: unknown;
  createdAt: Date;
};

type CashierConversionsFilters = {
  dateFrom?: Date;
  dateTo?: Date;
  amountMin?: number;
  amountMax?: number;
  phone?: string;
  code?: string;
};

/**
 * Paginated list of the cashier's conversions, ordered createdAt DESC.
 * Accepts filter object for date range, amount range, phone, and code.
 */
export const listCashierConversionsService = async (
  cashierId: string,
  filters: CashierConversionsFilters,
  page = 1,
  pageSize = 25,
) => {
  const [rows, total] = await listConversionsForCashier(cashierId, filters, page, pageSize);

  const items: ConversionDto[] = rows.map((c) => ({
    id: c.id,
    code: c.lead.code,
    phone: c.lead.phone,
    amount: c.amount,
    createdAt: c.createdAt,
  }));

  return { items, total, page, pageSize };
};

// ---------------------------------------------------------------------------
// Batch 5 — Per-session cashier-scoped services
// ---------------------------------------------------------------------------

/**
 * P5.3 — listMySessionsService
 * Lists all WhatsappSessions for the calling cashier with live WAHA status.
 */
export const listMySessionsService = async (cashierId: string) => {
  const dbSessions = await listSessionsByCashier(cashierId);

  return Promise.all(
    dbSessions.map(async (s) => {
      let wahaStatus = 'STOPPED';
      if (s.sessionName) {
        try {
          const wahaSession = await getSession(s.sessionName);
          wahaStatus = wahaSession?.status ?? 'STOPPED';
        } catch {
          wahaStatus = 'STOPPED';
        }
      }
      return {
        id: s.id,
        sessionName: s.sessionName,
        whatsappPhoneNumber: s.whatsappPhoneNumber,
        alias: s.alias,
        wahaStatus,
        refreshCount: s.refreshCount,
        lastRefreshAt: s.lastRefreshAt,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    }),
  );
};

/**
 * P5.4 — createMySessionService
 * Creates a new WhatsappSession for the calling cashier.
 * Enforces maxSessions cap.
 */
export const createMySessionService = async (cashierId: string) => {
  // Delegates to whatsapp-session.service createSession (which checks the cap)
  const session = await createWhatsappSession(cashierId);
  emitCashierRuntimeStateChanged(cashierId);
  return {
    id: session.id,
    sessionName: session.sessionName,
    whatsappPhoneNumber: session.whatsappPhoneNumber,
    refreshCount: session.refreshCount,
    lastRefreshAt: session.lastRefreshAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
};

/**
 * P5.5 — deleteMySessionService
 * Deletes a specific WhatsappSession — must belong to the requesting cashier.
 */
export const deleteMySessionService = async (cashierId: string, sessionId: string) => {
  // Verify ownership before deleting
  const session = await prisma.whatsappSession.findUnique({
    where: { id: sessionId },
    select: { id: true, cashierId: true, sessionName: true },
  });

  if (!session) {
    throw new Error('SESSION_NOT_FOUND');
  }

  if (session.cashierId !== cashierId) {
    throw new Error(SESSION_NOT_OWNED);
  }

  const result = await deleteWhatsappSession(sessionId);
  emitCashierRuntimeStateChanged(cashierId);
  return result;
};

/**
 * Shared core for starting the WhatsApp QR/pairing flow for a specific session.
 * Does NOT perform ownership checks — callers are responsible for authorization.
 * Exported so the admin module can reuse it without duplicating WAHA call logic.
 */
export const _startWhatsappLinkForSessionUnsafe = async (
  sessionId: string,
  phoneNumber: string,
) => {
  const session = await prisma.whatsappSession.findUnique({
    where: { id: sessionId },
    select: { id: true, cashierId: true, sessionName: true, whatsappPhoneNumber: true, refreshCount: true },
  });

  if (!session) {
    throw new Error('SESSION_NOT_FOUND');
  }

  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  try {
    // Delete existing WAHA session first (best-effort) if it exists
    if (session.sessionName) {
      try {
        await deleteSession(session.sessionName);
      } catch {
        // best effort
      }
    }

    const artifacts = await requestWhatsappAuthArtifacts(session.sessionName, normalizedPhone);

    // Update the session with the phone and reset refresh count
    await prisma.whatsappSession.update({
      where: { id: sessionId },
      data: {
        whatsappPhoneNumber: normalizedPhone,
        refreshCount: 0,
        lastRefreshAt: new Date(),
      },
    });

    emitCashierRuntimeStateChanged(session.cashierId);

    return {
      ...artifacts,
      refreshCount: 0,
      maxRefresh: REFRESH_CAP,
      nextRefreshInSeconds: 45,
    };
  } catch (error) {
    emitCashierRuntimeStateChanged(session.cashierId);
    throw error;
  }
};

/**
 * P5.6 — startWhatsappLinkForSessionService
 * Starts QR/pairing flow for a specific WhatsappSession.
 * Session must belong to the requesting cashier (ownership enforced here).
 */
export const startWhatsappLinkForSessionService = async (
  cashierId: string,
  sessionId: string,
  phoneNumber: string,
) => {
  // Ownership check: verify session belongs to the cashier before delegating
  const session = await prisma.whatsappSession.findUnique({
    where: { id: sessionId },
    select: { cashierId: true },
  });

  if (!session) {
    throw new Error('SESSION_NOT_FOUND');
  }

  if (session.cashierId !== cashierId) {
    throw new Error(SESSION_NOT_OWNED);
  }

  return _startWhatsappLinkForSessionUnsafe(sessionId, phoneNumber);
};

/**
 * P5.7 — refreshWhatsappLinkForSessionService
 * Refreshes QR/pairing for a specific session. Cap=3 per session.
 */
export const refreshWhatsappLinkForSessionService = async (
  cashierId: string,
  sessionId: string,
) => {
  const session = await prisma.whatsappSession.findUnique({
    where: { id: sessionId },
    select: { id: true, cashierId: true, sessionName: true, whatsappPhoneNumber: true, refreshCount: true },
  });

  if (!session) {
    throw new Error('SESSION_NOT_FOUND');
  }

  if (session.cashierId !== cashierId) {
    throw new Error(SESSION_NOT_OWNED);
  }

  if (!session.sessionName) {
    throw new Error('SESSION_NAME_REQUIRED');
  }

  if (!session.whatsappPhoneNumber) {
    throw new Error('PHONE_NUMBER_REQUIRED');
  }

  if (session.refreshCount >= REFRESH_CAP) {
    return null; // caller maps to MAX_REFRESH_REACHED
  }

  const nextCount = session.refreshCount + 1;
  await prisma.whatsappSession.update({
    where: { id: sessionId },
    data: { refreshCount: nextCount, lastRefreshAt: new Date() },
  });

  const artifacts = await requestWhatsappAuthArtifacts(session.sessionName, session.whatsappPhoneNumber);
  emitCashierRuntimeStateChanged(cashierId);

  return {
    ...artifacts,
    refreshCount: nextCount,
    maxRefresh: REFRESH_CAP,
    nextRefreshInSeconds: 45,
  };
};

/**
 * P5.8 — resetWhatsappLinkForSessionService
 * Resets refreshCount to 0 for a specific session.
 */
export const resetWhatsappLinkForSessionService = async (
  cashierId: string,
  sessionId: string,
) => {
  const session = await prisma.whatsappSession.findUnique({
    where: { id: sessionId },
    select: { id: true, cashierId: true },
  });

  if (!session) {
    throw new Error('SESSION_NOT_FOUND');
  }

  if (session.cashierId !== cashierId) {
    throw new Error(SESSION_NOT_OWNED);
  }

  await prisma.whatsappSession.update({
    where: { id: sessionId },
    data: { refreshCount: 0, lastRefreshAt: new Date() },
  });

  emitCashierRuntimeStateChanged(cashierId);
};

/**
 * P5.9 — getWhatsappLinkStatusForSessionService
 * Returns live WAHA status for a specific session.
 */
export const getWhatsappLinkStatusForSessionService = async (
  cashierId: string,
  sessionId: string,
) => {
  const session = await prisma.whatsappSession.findUnique({
    where: { id: sessionId },
    select: { id: true, cashierId: true, sessionName: true, whatsappPhoneNumber: true },
  });

  if (!session) {
    throw new Error('SESSION_NOT_FOUND');
  }

  if (session.cashierId !== cashierId) {
    throw new Error(SESSION_NOT_OWNED);
  }

  if (!session.sessionName) {
    return { status: 'STOPPED', linked: false, sessionName: '', phone: session.whatsappPhoneNumber };
  }

  let status = 'STOPPED';
  try {
    const wahaSession = await getSession(session.sessionName);
    status = wahaSession?.status ?? 'STOPPED';
  } catch {
    status = 'STOPPED';
  }

  return {
    status,
    linked: status === 'WORKING',
    sessionName: session.sessionName,
    phone: session.whatsappPhoneNumber,
  };
};
