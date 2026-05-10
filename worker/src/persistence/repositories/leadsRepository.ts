import { LeadStatus } from '../../generated/prisma/client.js';
import { prisma } from '../prisma/client.js';

export type LandingCashierCandidate = {
  cashierId: string;
  sessionName: string;
  activeSince: Date | null;
};

type CreateLeadData = {
  code: string;
  adCode?: string;
  fbc: string;
  fbp: string;
  userAgent: string;
  metaPixelId: string;
};

type UpdateLeadData = {
  status?: LeadStatus;
  phone?: string;
  cashierId?: string | null;
  contactedAt?: Date | null;
};

export async function saveLead(data: CreateLeadData) {
  return prisma.lead.create({
    data,
  });
}

export async function getActiveLandingCashierCandidatesByMetaPixelId(
  metaPixelId: string,
): Promise<LandingCashierCandidate[] | null> {
  const landing = await prisma.landing.findFirst({
    where: {
      metaPixelId,
      status: 'ACTIVE',
    },
    select: {
      cashiers: {
        where: {
          cashier: {
            status: 'ACTIVE',
            sessionName: {
              not: null,
            },
            activity: {
              some: {
                endedAt: null,
              },
            },
          },
        },
        select: {
          cashier: {
            select: {
              id: true,
              sessionName: true,
              activity: {
                where: {
                  endedAt: null,
                },
                orderBy: {
                  createdAt: 'desc',
                },
                take: 1,
                select: {
                  createdAt: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!landing) {
    return null;
  }

  return landing.cashiers.flatMap((item) => {
    const sessionName = item.cashier.sessionName;
    if (!sessionName) {
      return [];
    }

    return [
      {
        cashierId: item.cashier.id,
        sessionName,
        activeSince: item.cashier.activity[0]?.createdAt ?? null,
      },
    ];
  });
}

export type LandingCashierWaCandidate = {
  cashierId: string;
  sessionName: string;
  whatsappPhoneNumber: string | null;
};

export async function getAllLinkedCashierCandidatesByMetaPixelId(
  metaPixelId: string,
): Promise<LandingCashierWaCandidate[] | null> {
  const landing = await prisma.landing.findFirst({
    where: {
      metaPixelId,
      status: 'ACTIVE',
    },
    select: {
      cashiers: {
        where: {
          cashier: {
            status: 'ACTIVE',
            sessionName: {
              not: null,
            },
          },
        },
        select: {
          cashier: {
            select: {
              id: true,
              sessionName: true,
              whatsappPhoneNumber: true,
            },
          },
        },
      },
    },
  });

  if (!landing) {
    return null;
  }

  return landing.cashiers.flatMap((item) => {
    const sessionName = item.cashier.sessionName;
    if (!sessionName) {
      return [];
    }

    return [
      {
        cashierId: item.cashier.id,
        sessionName,
        whatsappPhoneNumber: item.cashier.whatsappPhoneNumber,
      },
    ];
  });
}

export type LandingFallbackPhoneRow = { id: string; phone: string };

export async function getLandingFallbackPhonesByMetaPixelId(
  metaPixelId: string,
): Promise<LandingFallbackPhoneRow[] | null> {
  const landing = await prisma.landing.findFirst({
    where: {
      metaPixelId,
      status: 'ACTIVE',
    },
    select: {
      fallbackPhones: {
        select: {
          id: true,
          phone: true,
        },
      },
    },
  });

  if (!landing) {
    return null;
  }

  return landing.fallbackPhones;
}

export async function getContactedLeadCountByCashierForLanding(
  metaPixelId: string,
  cashierIds: string[],
  since: Date,
  until: Date,
): Promise<Map<string, number>> {
  if (cashierIds.length === 0) {
    return new Map();
  }

  const grouped = await prisma.lead.groupBy({
    by: ['cashierId'],
    where: {
      metaPixelId,
      contactedAt: {
        gte: since,
        lt: until,
      },
      cashierId: {
        in: cashierIds,
      },
    },
    _count: {
      _all: true,
    },
  });

  const counts = new Map<string, number>();
  for (const row of grouped) {
    if (!row.cashierId) {
      continue;
    }

    counts.set(row.cashierId, row._count._all);
  }

  return counts;
}

export async function getLeadByCode(code: string) {
  return prisma.lead.findUnique({
    where: { code },
  });
}

export async function getLeadByFbc(fbc: string) {
  return prisma.lead.findFirst({
    where: { fbc },
    select: { id: true },
  });
}

export async function updateLead(id: string, data: UpdateLeadData) {
  return prisma.lead.update({
    where: { id },
    data,
  });
}

export async function markLeadAsContacted(
  id: string,
  phone: string,
  cashierId: string,
  now: Date,
): Promise<number> {
  const result = await prisma.lead.updateMany({
    where: {
      id,
      status: 'NOT_CONTACTED',
      contactedAt: null,
    },
    data: {
      phone,
      cashierId,
      status: 'CONTACTED',
      contactedAt: now,
    },
  });

  return result.count;
}
