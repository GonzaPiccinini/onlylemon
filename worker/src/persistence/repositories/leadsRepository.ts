import { LeadStatus } from '../../generated/prisma/client.js';
import { prisma } from '../prisma/client.js';

/**
 * C2 — L1 candidate shape: sessions of En-turno ACTIVE cashiers bound to landing.
 * WORKING status filtering is done by the caller using live WAHA getSessions().
 */
export type LandingCashierCandidate = {
  cashierId: string;
  sessionId?: string;
  sessionName: string;
  activeSince: Date | null;
};

type CreateLeadData = {
  code: string;
  adCode?: string;
  fbc: string;
  fbp: string;
  userAgent: string;
  metaPixelId: string;     // OLD scalar pixel number — still NOT NULL during Expand phase
  metaPixelRef: string;    // transitional FK → MetaPixel.id (snapshot at create time)
  eventSourceUrl: string;  // snapshot of Landing.url at create time
  landingId: string;       // routing key — NOT NULL after tighten
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
    include: {
      metaPixelRelation: true, // include full MetaPixel row (with accessToken) for CAPI dispatch
    },
  });
}

/**
 * C2 — L1 query: sessions bound to a landing whose cashier is ACTIVE and En turno (open SessionActivity).
 * Returns null when the landing is not found or not ACTIVE.
 * Re-keyed from metaPixelId to landingId (Phase 2 cutover).
 */
export async function getActiveLandingCashierCandidatesByLandingId(
  landingId: string,
): Promise<LandingCashierCandidate[] | null> {
  const landing = await prisma.landing.findFirst({
    where: {
      id: landingId,
      status: 'ACTIVE',
    },
    select: {
      sessions: {
        where: {
          session: {
            cashier: {
              status: 'ACTIVE',
              activity: {
                some: {
                  endedAt: null,
                },
              },
            },
          },
        },
        select: {
          session: {
            select: {
              id: true,
              sessionName: true,
              cashierId: true,
              cashier: {
                select: {
                  activity: {
                    where: { endedAt: null },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { createdAt: true },
                  },
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

  return landing.sessions.map((item) => ({
    cashierId: item.session.cashierId,
    sessionId: item.session.id,
    sessionName: item.session.sessionName,
    activeSince: item.session.cashier.activity[0]?.createdAt ?? null,
  }));
}

/**
 * C3 — L2 candidate shape: all sessions of ACTIVE cashiers bound to landing.
 * Caller filters by live WAHA WORKING set.
 */
export type LandingCashierWaCandidate = {
  cashierId: string;
  sessionId?: string;
  sessionName: string;
};

export async function getAllLinkedCashierCandidatesByLandingId(
  landingId: string,
): Promise<LandingCashierWaCandidate[] | null> {
  const landing = await prisma.landing.findFirst({
    where: {
      id: landingId,
      status: 'ACTIVE',
    },
    select: {
      sessions: {
        where: {
          session: {
            cashier: {
              status: 'ACTIVE',
            },
          },
        },
        select: {
          session: {
            select: {
              id: true,
              sessionName: true,
              cashierId: true,
            },
          },
        },
      },
    },
  });

  if (!landing) {
    return null;
  }

  return landing.sessions.map((item) => ({
    cashierId: item.session.cashierId,
    sessionId: item.session.id,
    sessionName: item.session.sessionName,
  }));
}

export type LandingFallbackPhoneRow = { id: string; phone: string };

export async function getLandingFallbackPhonesByLandingId(
  landingId: string,
): Promise<LandingFallbackPhoneRow[] | null> {
  const landing = await prisma.landing.findFirst({
    where: {
      id: landingId,
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

/**
 * Counts leads contacted by each cashier for a specific landing within a time window.
 * Re-keyed from metaPixelId (old scalar) to landingId (Phase 2 cutover).
 * This prevents two landings sharing one pixel from conflating their deficit counts.
 */
export async function getContactedLeadCountByCashierForLanding(
  landingId: string,
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
      landingId,
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
    include: {
      metaPixelRelation: true, // include full MetaPixel row (with accessToken) for CAPI dispatch
    },
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
