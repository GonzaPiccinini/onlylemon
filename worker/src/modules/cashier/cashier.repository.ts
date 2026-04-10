import { LeadStatus } from '../../generated/prisma/client.js';
import { prisma } from '../../persistence/prisma/client.js';

export const getCashierSession = (cashierId: string) =>
  prisma.cashier.findUniqueOrThrow({
    where: { id: cashierId },
    include: {
      user: true,
    },
  });

export const getCashierBySessionName = (sessionName: string) =>
  prisma.cashier.findFirst({
    where: {
      sessionName,
    },
    select: {
      id: true,
      sessionName: true,
    },
  });

export const updateCashierWhatsappLink = (
  cashierId: string,
  input: {
    sessionName?: string | null;
    whatsappPhoneNumber?: string | null;
    whatsappLinkRefreshCount?: number;
    whatsappLinkUpdatedAt?: Date | null;
  },
) =>
  prisma.cashier.update({
    where: { id: cashierId },
    data: input,
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

export const findQueueLeadForCashier = async (cashierId: string) => {
  const now = new Date();

  await prisma.lead.updateMany({
    where: {
      cashierId,
      status: 'CONTACTED',
      expiresAt: {
        lte: now,
      },
    },
    data: {
      status: 'EXPIRED',
    },
  });

  return prisma.lead.findFirst({
    where: {
      cashierId,
      status: 'CONTACTED',
      expiresAt: {
        gt: now,
      },
    },
    orderBy: [
      {
        contactedAt: 'asc',
      },
      {
        createdAt: 'asc',
      },
    ],
  });
};

export const findLeadByIdForCashier = (leadId: string, cashierId: string) =>
  prisma.lead.findFirst({
    where: {
      id: leadId,
      cashierId,
    },
  });

export const moveLeadToQueueTail = (leadId: string, now: Date) =>
  prisma.lead.update({
    where: { id: leadId },
    data: {
      contactedAt: now,
    },
  });

export const convertLead = (leadId: string, amount: number, convertedAt: Date) =>
  prisma.lead.update({
    where: { id: leadId },
    data: {
      amount,
      status: 'CONVERTED',
      convertedAt,
    },
  });

export const listLeadsForCashier = async (
  cashierId: string,
  status?: LeadStatus,
) => {
  const now = new Date();

  await prisma.lead.updateMany({
    where: {
      cashierId,
      status: {
        in: ['NOT_CONTACTED', 'CONTACTED'],
      },
      expiresAt: {
        lte: now,
      },
    },
    data: {
      status: 'EXPIRED',
    },
  });

  return prisma.lead.findMany({
    where: {
      cashierId,
      ...(status ? { status } : {}),
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};

export const updateCashierAccount = async (
  cashierId: string,
  input: {
    username?: string;
    password?: string;
  },
) => {
  const cashier = await prisma.cashier.findUniqueOrThrow({
    where: {
      id: cashierId,
    },
  });

  return prisma.user.update({
    where: {
      id: cashier.userId,
    },
    data: {
      ...(input.username ? { username: input.username } : {}),
      ...(input.password ? { password: input.password } : {}),
    },
    select: {
      id: true,
      username: true,
      name: true,
    },
  });
};
