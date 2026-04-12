import { LeadStatus } from '../../generated/prisma/client.js';
import { sendMetaConversion } from '../../integrations/leads/conversion.js';
import { getLandingByMetaPixelId } from '../admin/admin.repository.js';
import {
  createSessionIfNotExists,
  deleteSession,
  getSession,
  getSessionQr,
  requestSessionCode,
  startSession,
} from '../../integrations/waha/client.js';
import {
  convertLead,
  finishCurrentSessionActivity,
  findLeadByIdForCashier,
  findQueueLeadForCashier,
  finishSessionActivity,
  getCashierById,
  getCashierBySessionName,
  getCashierSession,
  getCurrentSessionActivity,
  listLeadsForCashier,
  listSessionActivities,
  moveLeadToQueueTail,
  startSessionActivity,
  updateCashierAccount,
  updateCashierWhatsappLink,
} from './cashier.repository.js';
import { hashPassword } from '../../utils/password.js';
import { emitCashierRuntimeStateChanged } from './runtime-events.js';
import { logger } from '../../lib/logger.js';
import {
  leadsConvertedTotal,
  leadConversionAmountArs,
} from '../../lib/metrics.js';

const WHATSAPP_LINK_MAX_REFRESH = 3;
const rotatingCashiers = new Set<string>();
const WAHA_SESSION_READY_TIMEOUT_MS = 20000;
const WAHA_SESSION_READY_POLL_MS = 750;
const WAHA_MAX_SESSION_NAME_LENGTH = 54;

const NON_OPERATIONAL_WAHA_STATUSES = new Set([
  'UNLINKED',
  'STOPPED',
  'STARTING',
  'SCAN_QR_CODE',
  'FAILED',
]);

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

const toLeadDto = (lead: {
  id: string;
  code: string;
  phone: string | null;
  status: LeadStatus;
  amount: unknown | null;
  contactedAt: Date | null;
  convertedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}) => ({
  id: lead.id,
  code: lead.code,
  phone: lead.phone,
  status: lead.status,
  amount: lead.amount === null ? null : Number(lead.amount),
  contactedAt: lead.contactedAt,
  convertedAt: lead.convertedAt,
  expiresAt: lead.expiresAt,
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

  const sessionName = cashier.sessionName ?? '';
  let wahaStatus = 'UNLINKED';
  if (cashier.sessionName) {
    try {
      const session = await getSession(cashier.sessionName);
      wahaStatus = session?.status ?? 'UNLINKED';
    } catch {
      wahaStatus = 'UNLINKED';
    }
  }

  const canOperateLeads =
    cashier.status === 'ACTIVE' && Boolean(cashier.sessionName) && wahaStatus === 'WORKING';

  return {
    cashierId: cashier.id,
    cashierStatus: cashier.status,
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
          : runtime.wahaStatus === 'UNLINKED'
            ? 'WHATSAPP_NOT_LINKED'
            : 'WHATSAPP_NOT_WORKING',
      runtime,
    };
  }

  return {
    allowed: true as const,
    runtime,
  };
};

export const processWhatsappSessionStatusService = async (
  sessionName: string,
  status: string,
  occurredAt: Date,
) => {
  const cashier = await getCashierBySessionName(sessionName);
  if (!cashier) {
    return {
      matched: false as const,
    };
  }

  const nonOperational = NON_OPERATIONAL_WAHA_STATUSES.has(status);
  if (nonOperational) {
    await finishCurrentSessionActivity(cashier.id, occurredAt);
  }

  const shouldRotate = status === 'FAILED' || status === 'STOPPED';
  let rotated = false;
  let nextSessionName: string | null = null;

  if (shouldRotate && !rotatingCashiers.has(cashier.id)) {
    rotatingCashiers.add(cashier.id);

    try {
      const previousSessionName = cashier.sessionName;

      await deleteSession(previousSessionName ?? sessionName);
      await updateCashierWhatsappLink(cashier.id, {
        sessionName: null,
        whatsappPhoneNumber: null,
        whatsappLinkRefreshCount: 0,
        whatsappLinkUpdatedAt: occurredAt,
      });

      rotated = true;
      nextSessionName = null;
    } catch (error) {
      logger.error({
        event: 'waha_rotation_failed',
        cashierId: cashier.id,
        sessionName,
        status,
        err: error,
      });
    } finally {
      rotatingCashiers.delete(cashier.id);
    }
  }

  const currentState = await getCashierById(cashier.id);
  if (!currentState?.sessionName || currentState.sessionName === sessionName) {
    emitCashierRuntimeStateChanged(cashier.id);
  }

  return {
    matched: true as const,
    cashierId: cashier.id,
    status,
    nonOperational,
    rotated,
    nextSessionName,
  };
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
  const sessionName = cashier.sessionName ?? '';

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
    needsLink: !cashier.sessionName || !cashier.whatsappPhoneNumber,
    sessionName,
    refreshCount: cashier.whatsappLinkRefreshCount,
    maxRefresh: WHATSAPP_LINK_MAX_REFRESH,
    status: wahaStatus ?? 'UNLINKED',
  };
};

export const startWhatsappLinkService = async (
  cashierId: string,
  phoneNumber: string,
) => {
  const cashier = await getCashierSession(cashierId);
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  const sessionName = buildWhatsappSessionName(cashier.id);
  assertValidSessionName(sessionName);

  try {
    if (cashier.sessionName) {
      await deleteSession(cashier.sessionName);
    }

    const artifacts = await requestWhatsappAuthArtifacts(sessionName, normalizedPhone);
    await updateCashierWhatsappLink(cashier.id, {
      sessionName,
      whatsappPhoneNumber: normalizedPhone,
      whatsappLinkRefreshCount: 0,
      whatsappLinkUpdatedAt: new Date(),
    });
    emitCashierRuntimeStateChanged(cashier.id);

    return {
      ...artifacts,
      refreshCount: 0,
      maxRefresh: WHATSAPP_LINK_MAX_REFRESH,
      nextRefreshInSeconds: 45,
    };
  } catch (error) {
    try {
      await deleteSession(sessionName);
    } catch {
      // best effort cleanup
    }

    await updateCashierWhatsappLink(cashier.id, {
      sessionName: null,
      whatsappPhoneNumber: null,
      whatsappLinkRefreshCount: 0,
      whatsappLinkUpdatedAt: new Date(),
    });
    emitCashierRuntimeStateChanged(cashier.id);
    throw error;
  }
};

export const refreshWhatsappLinkService = async (cashierId: string) => {
  const cashier = await getCashierSession(cashierId);
  if (!cashier.sessionName) {
    throw new Error('SESSION_NAME_REQUIRED');
  }

  if (!cashier.whatsappPhoneNumber) {
    throw new Error('PHONE_NUMBER_REQUIRED');
  }

  if (cashier.whatsappLinkRefreshCount >= WHATSAPP_LINK_MAX_REFRESH) {
    return null;
  }

  const nextCount = cashier.whatsappLinkRefreshCount + 1;
  await updateCashierWhatsappLink(cashierId, {
    whatsappLinkRefreshCount: nextCount,
    whatsappLinkUpdatedAt: new Date(),
  });

  const sessionName = cashier.sessionName;
  const artifacts = await requestWhatsappAuthArtifacts(
    sessionName,
    cashier.whatsappPhoneNumber,
  );
  emitCashierRuntimeStateChanged(cashier.id);

  return {
    ...artifacts,
    refreshCount: nextCount,
    maxRefresh: WHATSAPP_LINK_MAX_REFRESH,
    nextRefreshInSeconds: 45,
  };
};

export const resetWhatsappLinkService = async (cashierId: string) => {
  await updateCashierWhatsappLink(cashierId, {
    whatsappLinkRefreshCount: 0,
    whatsappLinkUpdatedAt: new Date(),
  });
  emitCashierRuntimeStateChanged(cashierId);
};

export const getWhatsappLinkStatusService = async (cashierId: string) => {
  const cashier = await getCashierSession(cashierId);
  const sessionName = cashier.sessionName ?? '';
  if (!sessionName) {
    return {
      sessionName,
      status: 'UNLINKED',
      linked: false,
    };
  }

  const session = await getSession(sessionName);
  const status = session?.status ?? 'UNLINKED';

  if (status === 'WORKING' && !cashier.sessionName) {
    await updateCashierWhatsappLink(cashierId, {
      sessionName,
      whatsappLinkRefreshCount: 0,
      whatsappLinkUpdatedAt: new Date(),
    });
    emitCashierRuntimeStateChanged(cashierId);
  }

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
  const session = await getSession(sessionName);
  if (!session || session.status !== 'WORKING') {
    return null;
  }

  await updateCashierWhatsappLink(cashierId, {
    sessionName,
    whatsappLinkRefreshCount: 0,
    whatsappLinkUpdatedAt: new Date(),
  });
  emitCashierRuntimeStateChanged(cashierId);

  return {
    linked: true,
    sessionName,
    status: session.status,
  };
};

export const getCurrentQueueLeadService = async (cashierId: string) => {
  await getCashierSession(cashierId);
  const lead = await findQueueLeadForCashier(cashierId);

  if (!lead) {
    return null;
  }

  return toLeadDto(lead);
};

export const skipQueueLeadService = async (cashierId: string, leadId: string) => {
  const lead = await findLeadByIdForCashier(leadId, cashierId);
  if (!lead) {
    return 'NOT_FOUND' as const;
  }

  if (lead.status !== 'CONTACTED') {
    return 'INVALID_STATUS' as const;
  }

  const now = new Date();
  if (lead.expiresAt <= now) {
    return 'EXPIRED' as const;
  }

  await moveLeadToQueueTail(lead.id, now);
  return 'OK' as const;
};

export const convertQueueLeadService = async (
  cashierId: string,
  leadId: string,
  amount: number,
) => {
  const lead = await findLeadByIdForCashier(leadId, cashierId);
  if (!lead) {
    return { kind: 'NOT_FOUND' as const };
  }

  if (lead.status !== 'CONTACTED') {
    return { kind: 'INVALID_STATUS' as const };
  }

  const now = new Date();
  if (lead.expiresAt <= now) {
    return { kind: 'EXPIRED' as const };
  }

  if (!lead.phone) {
    return { kind: 'PHONE_REQUIRED' as const };
  }

  const converted = await convertLead(lead.id, amount, now);

  leadsConvertedTotal.labels(lead.metaPixelId).inc();
  leadConversionAmountArs.labels(lead.metaPixelId).observe(amount);
  logger.info({
    event: 'lead_converted',
    leadId: lead.id,
    cashierId,
    metaPixelId: lead.metaPixelId,
    amount,
  });

  const landing = await getLandingByMetaPixelId(lead.metaPixelId);

  if (!landing) {
    logger.error({
      event: 'meta_landing_not_found',
      leadId: lead.id,
      metaPixelId: lead.metaPixelId,
    });

    return { kind: 'OK' as const, data: toLeadDto(converted) };
  }

  const conversionResult = await sendMetaConversion({
    phone: lead.phone,
    value: amount,
    fbc: lead.fbc,
    fbp: lead.fbp,
    userAgent: lead.userAgent,
    metaPixelId: lead.metaPixelId,
    metaAccessToken: landing.metaAccessToken,
    eventId: lead.id,
  });

  if (!conversionResult.purchaseSent) {
    logger.error({
      event: 'meta_conversion_failed',
      leadId: lead.id,
      metaPixelId: lead.metaPixelId,
      eventName: 'Purchase',
    });
  }

  if (conversionResult.highValueRequired && !conversionResult.highValueSent) {
    logger.error({
      event: 'meta_conversion_failed',
      leadId: lead.id,
      metaPixelId: lead.metaPixelId,
      eventName: 'HighValueCustomer',
    });
  }

  return { kind: 'OK' as const, data: toLeadDto(converted) };
};

export const listCashierLeadsService = async (
  cashierId: string,
  status?: LeadStatus,
) => {
  await getCashierSession(cashierId);
  const leads = await listLeadsForCashier(cashierId, status);
  return leads.map(toLeadDto);
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
    ...(input.password ? { password: hashPassword(input.password) } : {}),
  });

  return {
    id: updated.id,
    name: updated.name,
    username: updated.username,
  };
};
