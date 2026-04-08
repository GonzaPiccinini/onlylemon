import { getLatestTrackedLeadByPhone } from '../../persistence/repositories/leadsRepository.js';
import { prisma } from '../../persistence/prisma/client.js';

export const getCashierSession = (cashierId: string) =>
  prisma.session.upsert({
    where: { cashierId },
    create: { cashierId },
    update: {},
    include: {
      cashier: {
        include: {
          user: true,
        },
      },
    },
  });

export const getCurrentSessionActivity = (sessionId: string) =>
  prisma.sessionActivity.findFirst({
    where: {
      sessionId,
      endedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

export const listSessionActivities = (sessionId: string) =>
  prisma.sessionActivity.findMany({
    where: { sessionId },
    orderBy: {
      createdAt: 'desc',
    },
  });

export const startSessionActivity = (sessionId: string) =>
  prisma.sessionActivity.create({
    data: { sessionId },
  });

export const finishSessionActivity = (activityId: string, endedAt: Date) =>
  prisma.sessionActivity.update({
    where: { id: activityId },
    data: { endedAt },
  });

export const findChatByPhoneInSession = (sessionId: string, phoneNumber: string) =>
  prisma.chat.findFirst({
    where: {
      sessionId,
      id: phoneNumber,
    },
  });

export const createChatInSession = (
  sessionId: string,
  phoneNumber: string,
  fromAds: boolean,
) =>
  prisma.chat.create({
    data: {
      id: phoneNumber,
      sessionId,
      fromAds,
    },
  });

export const resolveFromAdsByPhone = async (phoneNumber: string): Promise<boolean> => {
  const lead = await getLatestTrackedLeadByPhone(phoneNumber);
  return Boolean(lead);
};

export const createAddFunds = (input: {
  userName: string;
  phoneId: string;
  phoneNumber: string;
  amount: number;
  chatId: string;
}) =>
  prisma.addFunds.create({
    data: {
      userName: input.userName,
      phoneId: input.phoneId,
      phoneNumber: input.phoneNumber,
      amount: input.amount,
      chatId: input.chatId,
    },
    include: {
      chat: {
        include: {
          session: {
            include: {
              cashier: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      },
    },
  });

export const listAddFundsBySession = (sessionId: string) =>
  prisma.addFunds.findMany({
    where: {
      chat: {
        sessionId,
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
      phoneId: true,
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
        phoneId: item.phoneId,
        phoneNumber: item.phoneNumber,
      });
    }
  });

  return [...unique.values()];
};
