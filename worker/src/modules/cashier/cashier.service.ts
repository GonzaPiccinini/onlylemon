import {
  getLatestContactedLeadByPhone,
  markLeadAsConvertedIfContacted,
} from '../../persistence/repositories/leadsRepository.js';
import { sendMetaConversion } from '../../integrations/leads/conversion.js';
import {
  createSessionIfNotExists,
  getSession,
  getSessionQr,
  requestSessionCode,
  startSession,
} from '../../integrations/waha/client.js';
import {
  createAddFunds,
  createChatInSession,
  findChatByPhoneInSession,
  finishSessionActivity,
  getCashierSession,
  getCurrentSessionActivity,
  listClientPhones,
  listAddFundsByCashier,
  listSessionActivities,
  resolveFromAdsByPhone,
  startSessionActivity,
  updateCashierWhatsappLink,
} from './cashier.repository.js';
import type { AddFundsPayload } from './cashier.types.js';

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

export const listClientPhonesService = async (cashierId: string) => {
  await getCashierSession(cashierId);
  const existing = await listClientPhones();
  return existing.map((item) => ({
    phoneId: item.phoneNumber,
    phoneNumber: item.phoneNumber,
  }));
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

const sendConversionIfApplicable = async (addFundsId: string, input: AddFundsPayload) => {
  const lead = await getLatestContactedLeadByPhone(input.phoneNumber);
  if (!lead) {
    return;
  }

  const converted = await markLeadAsConvertedIfContacted(lead.id);
  if (converted !== 1) {
    return;
  }

  const sent = await sendMetaConversion({
    phoneNumber: input.phoneNumber,
    value: input.amount,
    fbc: lead.fbc,
    fbp: lead.fbp,
    userAgent: lead.userAgent,
    eventId: addFundsId,
  });

  if (!sent) {
    console.error('meta_conversion_failed', {
      leadId: lead.id,
      addFundsId,
    });
  }
};

export const createAddFundsService = async (
  cashierId: string,
  input: AddFundsPayload,
) => {
  const cashier = await getCashierSession(cashierId);
  const current = await getCurrentSessionActivity(cashier.id);
  if (!current) {
    return null;
  }

  let chat = await findChatByPhoneInSession(cashier.id, input.phoneNumber);
  if (!chat) {
    const fromAds = await resolveFromAdsByPhone(input.phoneNumber);
    chat = await createChatInSession(cashier.id, input.phoneNumber, fromAds);
  }

  const addFunds = await createAddFunds({
    ...input,
    chatId: chat.id,
  });

  await sendConversionIfApplicable(addFunds.id, input);

  return {
    id: addFunds.id,
    cashierId,
    cashierName: addFunds.chat.cashier.user.name,
    userName: addFunds.userName,
    phoneId: addFunds.phoneNumber,
    phoneNumber: addFunds.phoneNumber,
    amount: Number(addFunds.amount),
    fromAds: addFunds.chat.fromAds,
    createdAt: addFunds.createdAt,
  };
};

export const listAddFundsHistoryService = async (cashierId: string) => {
  const cashier = await getCashierSession(cashierId);
  const addFunds = await listAddFundsByCashier(cashier.id);

  return addFunds.map((item) => ({
    id: item.id,
    cashierId,
    cashierName: cashier.user.name,
    userName: item.userName,
    phoneId: item.phoneNumber,
    phoneNumber: item.phoneNumber,
    amount: Number(item.amount),
    fromAds: item.chat.fromAds,
    createdAt: item.createdAt,
  }));
};
