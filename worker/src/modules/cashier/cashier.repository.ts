import { LeadStatus, type Prisma } from '../../generated/prisma/client.js';
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

export const getCashierById = (cashierId: string) =>
  prisma.cashier.findUnique({
    where: { id: cashierId },
    select: {
      id: true,
      sessionName: true,
      status: true,
      user: {
        select: {
          name: true,
        },
      },
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

export const finishCurrentSessionActivity = (cashierId: string, endedAt: Date) =>
  prisma.sessionActivity.updateMany({
    where: {
      cashierId,
      endedAt: null,
    },
    data: {
      endedAt,
    },
  });


export const findLeadByIdForCashier = (leadId: string, cashierId: string) =>
  prisma.lead.findFirst({
    where: {
      id: leadId,
      cashierId,
    },
  });


type PrismaTx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * M2.1 — Insert a Conversion row inside a transaction.
 * The caller is responsible for opening the transaction.
 */
export const createConversion = (
  tx: PrismaTx,
  data: { leadId: string; amount: number | Prisma.Decimal },
) =>
  tx.conversion.create({
    data: { leadId: data.leadId, amount: data.amount },
  });

/**
 * M2.3 — Search leads for a cashier by code or phone substring.
 * Empty q short-circuits to [] (never queries DB).
 * Includes the first Conversion (asc createdAt) for timeline derivation.
 */
export const searchLeadsForCashier = (cashierId: string, q: string) => {
  if (!q) {
    return Promise.resolve([]);
  }

  return prisma.lead.findMany({
    where: {
      cashierId,
      status: { in: ['CONTACTED', 'CONVERTED'] },
      OR: [{ code: { contains: q } }, { phone: { contains: q } }],
    },
    take: 10,
    orderBy: { contactedAt: 'desc' },
    include: {
      conversions: {
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });
};

/**
 * M2.4 — Paginated list of conversions for a cashier's leads, ordered createdAt DESC.
 */
export const listConversionsForCashier = (
  cashierId: string,
  page: number,
  pageSize: number,
) => {
  const skip = (page - 1) * pageSize;
  return Promise.all([
    prisma.conversion.findMany({
      where: { lead: { cashierId } },
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        lead: {
          select: { code: true, phone: true },
        },
      },
    }),
    prisma.conversion.count({ where: { lead: { cashierId } } }),
  ]);
};

export const listLeadsForCashier = async (
  cashierId: string,
  status?: LeadStatus,
) => {
  // NOTE: expiresAt guard and EXPIRED status update removed in meta-conversions-refactor

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
