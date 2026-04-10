import { LeadStatus } from '../../generated/prisma/client.js';
import { sendMetaConversion } from '../../integrations/leads/conversion.js';
import { getLandingByMetaPixelId } from '../admin/admin.repository.js';
import {
  createSessionIfNotExists,
  getSession,
  getSessionQr,
  requestSessionCode,
  startSession,
} from '../../integrations/waha/client.js';
import {
  convertLead,
  findLeadByIdForCashier,
  findQueueLeadForCashier,
  finishSessionActivity,
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

const WHATSAPP_LINK_MAX_REFRESH = 3;

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

export const startSessionService = async (cashierId: string) => {
  const cashier = await getCashierSession(cashierId);
  const current = await getCurrentSessionActivity(cashier.id);
  if (current) {
    return null;
  }

  const activity = await startSessionActivity(cashier.id);
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
  return {
    ...toSessionDto(finished),
    cashierId,
    cashierName: cashier.user.name,
  };
};

const getSessionCandidateName = (cashierId: string) => `cashier-${cashierId}`;

const requestWhatsappAuthArtifacts = async (
  sessionName: string,
  phoneNumber: string,
) => {
  await createSessionIfNotExists(sessionName);
  await startSession(sessionName);

  const [pairingCode, qr] = await Promise.all([
    requestSessionCode(sessionName, phoneNumber),
    getSessionQr(sessionName),
  ]);

  return {
    sessionName,
    pairingCode,
    qr,
  };
};

export const getWhatsappLinkStateService = async (cashierId: string) => {
  const cashier = await getCashierSession(cashierId);
  const sessionName = cashier.sessionName ?? getSessionCandidateName(cashier.id);

  let wahaStatus: string | null = null;
  try {
    const session = await getSession(sessionName);
    wahaStatus = session?.status ?? null;
  } catch {
    wahaStatus = null;
  }

  return {
    needsLink: !cashier.sessionName,
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
  const cashier = await updateCashierWhatsappLink(cashierId, {
    whatsappPhoneNumber: phoneNumber,
    whatsappLinkRefreshCount: 0,
    whatsappLinkUpdatedAt: new Date(),
  });

  const sessionName = cashier.sessionName ?? getSessionCandidateName(cashier.id);
  const artifacts = await requestWhatsappAuthArtifacts(sessionName, phoneNumber);

  return {
    ...artifacts,
    refreshCount: 0,
    maxRefresh: WHATSAPP_LINK_MAX_REFRESH,
    nextRefreshInSeconds: 45,
  };
};

export const refreshWhatsappLinkService = async (cashierId: string) => {
  const cashier = await getCashierSession(cashierId);
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

  const sessionName = cashier.sessionName ?? getSessionCandidateName(cashier.id);
  const artifacts = await requestWhatsappAuthArtifacts(
    sessionName,
    cashier.whatsappPhoneNumber,
  );

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
};

export const getWhatsappLinkStatusService = async (cashierId: string) => {
  const cashier = await getCashierSession(cashierId);
  const sessionName = cashier.sessionName ?? getSessionCandidateName(cashier.id);
  const session = await getSession(sessionName);
  const status = session?.status ?? 'UNLINKED';

  if (status === 'WORKING' && !cashier.sessionName) {
    await updateCashierWhatsappLink(cashierId, {
      sessionName,
      whatsappLinkRefreshCount: 0,
      whatsappLinkUpdatedAt: new Date(),
    });
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
  const landing = await getLandingByMetaPixelId(lead.metaPixelId);

  if (!landing) {
    console.error('meta_landing_not_found', {
      leadId: lead.id,
      metaPixelId: lead.metaPixelId,
    });

    return { kind: 'OK' as const, data: toLeadDto(converted) };
  }

  const sent = await sendMetaConversion({
    phone: lead.phone,
    value: amount,
    fbc: lead.fbc,
    fbp: lead.fbp,
    userAgent: lead.userAgent,
    metaPixelId: lead.metaPixelId,
    metaAccessToken: landing.metaAccessToken,
    eventId: lead.id,
  });

  if (!sent) {
    console.error('meta_conversion_failed', {
      leadId: lead.id,
      metaPixelId: lead.metaPixelId,
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
