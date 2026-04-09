import { getLatestTrackedLeadByPhone } from '../../persistence/repositories/leadsRepository.js';
import { prisma } from '../../persistence/prisma/client.js';

export const getCashierSession = (cashierId: string) =>
  prisma.cashier.findUniqueOrThrow({
    where: { id: cashierId },
    include: {
      user: true,
    },
  });

export const getCurrentSessionActivity = (cashierId: string) =>
  prisma.sessionActivity.findFirst({
    where: {
      cashierId,
      endedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

export const listSessionActivities = (cashierId: string) =>
  prisma.sessionActivity.findMany({
    where: { cashierId },
    orderBy: {
      createdAt: 'desc',
    },
  });

export const startSessionActivity = (cashierId: string) =>
  prisma.sessionActivity.create({
    data: { cashierId },
  });

export const finishSessionActivity = (activityId: string, endedAt: Date) =>
  prisma.sessionActivity.update({
    where: { id: activityId },
    data: { endedAt },
  });

export const findChatByPhoneInSession = (cashierId: string, phoneNumber: string) =>
  prisma.chat.findFirst({
    where: {
      cashierId,
      phone: phoneNumber,
    },
  });

export const createChatInSession = (
  cashierId: string,
  phoneNumber: string,
  fromAds: boolean,
) =>
  prisma.chat.create({
    data: {
      phone: phoneNumber,
      cashierId,
      fromAds,
    },
  });

export const resolveFromAdsByPhone = async (phoneNumber: string): Promise<boolean> => {
  const lead = await getLatestTrackedLeadByPhone(phoneNumber);
  return Boolean(lead);
};

export const createAddFunds = (input: {
  userName: string;
  phoneNumber: string;
  amount: number;
  chatId: string;
}) =>
  prisma.addFunds.create({
    data: {
      userName: input.userName,
      phoneNumber: input.phoneNumber,
      amount: input.amount,
      chatId: input.chatId,
    },
    include: {
      chat: {
        include: {
          cashier: {
            include: {
              user: true,
            },
          },
        },
      },
    },
  });

export const listAddFundsByCashier = (cashierId: string) =>
  prisma.addFunds.findMany({
    where: {
      chat: {
        cashierId,
      },
    },
    include: {
      chat: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

export const listClientPhones = async () => {
  const leads = await prisma.lead.findMany({
    where: {
      phone: {
        not: null,
      },
      status: {
        in: ['CONTACTED', 'CONVERTED'],
      },
    },
    orderBy: {
      matchedAt: 'desc',
    },
    select: {
      id: true,
      phone: true,
    },
  });

  const addFundsPhones = await prisma.addFunds.findMany({
    select: {
      phoneNumber: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const unique = new Map<string, { phoneId: string; phoneNumber: string }>();

  leads.forEach((item) => {
    if (!item.phone) {
      return;
    }

    if (!unique.has(item.phone)) {
      unique.set(item.phone, {
        phoneId: item.id,
        phoneNumber: item.phone,
      });
    }
  });

  addFundsPhones.forEach((item) => {
    if (!unique.has(item.phoneNumber)) {
      unique.set(item.phoneNumber, {
        phoneId: item.phoneNumber,
        phoneNumber: item.phoneNumber,
      });
    }
  });

  return [...unique.values()];
};
