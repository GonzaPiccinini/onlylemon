import {
  getLatestContactedLeadByPhone,
  markLeadAsConvertedIfContacted,
} from '../../persistence/repositories/leadsRepository.js';
import { sendMetaConversion } from '../../integrations/leads/conversion.js';
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
} from './cashier.repository.js';
import type { AddFundsPayload } from './cashier.types.js';

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
