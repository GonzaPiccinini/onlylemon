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
