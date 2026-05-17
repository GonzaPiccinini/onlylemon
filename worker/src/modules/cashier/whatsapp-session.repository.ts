import { prisma } from '../../persistence/prisma/client.js';

/**
 * C1 — getSessionBySessionName
 * Returns { session, cashier } for a given WAHA sessionName, or null if not found.
 * Used by BullMQ inbound message handler and WAHA webhook processor.
 */
export const getSessionBySessionName = (sessionName: string) =>
  prisma.whatsappSession.findUnique({
    where: { sessionName },
    include: {
      cashier: true,
    },
  });

/**
 * C2 — getActiveLandingSessionCandidatesByMetaPixelId
 * Returns sessions from cashiers that are:
 *   - ACTIVE status
 *   - Have an open SessionActivity (En turno)
 *   - Have at least one WhatsappSession bound to the landing
 * The workingSessionNames Set is provided by the caller (from live WAHA getSessions()).
 * Only sessions whose sessionName is in workingSessionNames are returned.
 */
export type ActiveSessionCandidate = {
  sessionId: string;
  sessionName: string;
  cashierId: string;
  activeSince: Date | null;
};

export async function getActiveLandingSessionCandidatesByMetaPixelId(
  metaPixelId: string,
  workingSessionNames: Set<string>,
): Promise<ActiveSessionCandidate[] | null> {
  const landing = await prisma.landing.findFirst({
    where: {
      metaPixelId,
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

  return landing.sessions
    .map((item) => ({
      sessionId: item.session.id,
      sessionName: item.session.sessionName,
      cashierId: item.session.cashierId,
      activeSince: item.session.cashier.activity[0]?.createdAt ?? null,
    }))
    .filter((c) => workingSessionNames.has(c.sessionName));
}

/**
 * C3 — getSessionsBoundToLanding
 * Returns all sessions bound to the landing (across any cashier).
 * Caller intersects with the live WAHA WORKING set.
 */
export type BoundSessionCandidate = {
  sessionId: string;
  sessionName: string;
  cashierId: string;
};

export async function getSessionsBoundToLanding(
  metaPixelId: string,
): Promise<BoundSessionCandidate[] | null> {
  const landing = await prisma.landing.findFirst({
    where: {
      metaPixelId,
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
    sessionId: item.session.id,
    sessionName: item.session.sessionName,
    cashierId: item.session.cashierId,
  }));
}
