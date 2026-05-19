import { prisma } from '../../persistence/prisma/client.js';
import { deleteSession, getSession } from '../../integrations/waha/client.js';
import { logger } from '../../lib/logger.js';
import { getSessionBySessionName } from './whatsapp-session.repository.js';
import {
  finishCurrentSessionActivity,
  getCurrentSessionActivity,
} from './cashier.repository.js';
import { emitCashierRuntimeStateChanged } from './runtime-events.js';

/**
 * Ends the cashier's active work session ONLY when no remaining WhatsApp
 * session is in WAHA status WORKING. Used after a WhatsApp session is
 * deleted or transitions to a non-operational status, to avoid terminating
 * the cashier's turn while other WhatsApp sessions are still online.
 *
 * @param excludeSessionId — optional WhatsappSession.id to ignore when
 *   computing the "any working" set. Useful when called BEFORE the row is
 *   actually deleted from DB (e.g. during rotation).
 */
export const finishWorkSessionIfNoWorkingWaha = async (
  cashierId: string,
  occurredAt: Date,
  excludeSessionId?: string,
) => {
  const current = await getCurrentSessionActivity(cashierId);
  if (!current) return false;

  const remaining = await prisma.whatsappSession.findMany({
    where: {
      cashierId,
      ...(excludeSessionId ? { NOT: { id: excludeSessionId } } : {}),
    },
    select: { sessionName: true },
  });

  if (remaining.length === 0) {
    await finishCurrentSessionActivity(cashierId, occurredAt);
    return true;
  }

  const statuses = await Promise.all(
    remaining.map(async (s) => {
      try {
        const wahaSession = await getSession(s.sessionName);
        return wahaSession?.status ?? 'STOPPED';
      } catch {
        return 'STOPPED';
      }
    }),
  );

  const anyWorking = statuses.some((s) => s === 'WORKING');
  if (!anyWorking) {
    await finishCurrentSessionActivity(cashierId, occurredAt);
    return true;
  }
  return false;
};

export const SESSION_CAP_REACHED = 'SESSION_CAP_REACHED';
export const REFRESH_CAP_REACHED = 'REFRESH_CAP_REACHED';
export const SESSION_NOT_FOUND = 'SESSION_NOT_FOUND';

export const REFRESH_CAP = 3;

const WAHA_MAX_SESSION_NAME_LENGTH = 54;

const buildWhatsappSessionName = (cashierId: string) => {
  const compactCashierId = cashierId.replace(/-/g, '');
  const suffix = Date.now().toString(36);
  return `cashier-${compactCashierId}-${suffix}`;
};

const assertValidSessionName = (sessionName: string) => {
  if (sessionName.length > WAHA_MAX_SESSION_NAME_LENGTH) {
    throw new Error('WAHA_SESSION_NAME_TOO_LONG');
  }
};

/**
 * B1 — listSessionsByCashier
 * Returns all WhatsappSession rows for a cashier.
 */
export const listSessionsByCashier = async (cashierId: string) => {
  return prisma.whatsappSession.findMany({
    where: { cashierId },
    orderBy: { createdAt: 'asc' },
  });
};

/**
 * B1/B2 — createSession
 * Creates a new WhatsappSession for a cashier.
 * Throws SESSION_CAP_REACHED if cashier is already at maxSessions.
 */
export const createSession = async (
  cashierId: string,
  deps: { now?: () => Date } = {},
): Promise<{
  id: string;
  cashierId: string;
  sessionName: string;
  whatsappPhoneNumber: string | null;
  refreshCount: number;
  lastRefreshAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}> => {
  const cashier = await prisma.cashier.findUniqueOrThrow({
    where: { id: cashierId },
    select: { id: true, maxSessions: true },
  });

  const currentCount = await prisma.whatsappSession.count({
    where: { cashierId },
  });

  if (currentCount >= cashier.maxSessions) {
    throw new Error(SESSION_CAP_REACHED);
  }

  const sessionName = buildWhatsappSessionName(cashierId);
  assertValidSessionName(sessionName);

  return prisma.whatsappSession.create({
    data: {
      cashierId,
      sessionName,
    },
  });
};

/**
 * B3 — refreshSession
 * Increments refreshCount on a WhatsappSession. Throws REFRESH_CAP_REACHED when >= REFRESH_CAP.
 */
export const refreshSession = async (sessionId: string) => {
  const session = await prisma.whatsappSession.findUniqueOrThrow({
    where: { id: sessionId },
  });

  if (session.refreshCount >= REFRESH_CAP) {
    throw new Error(REFRESH_CAP_REACHED);
  }

  const nextCount = session.refreshCount + 1;
  return prisma.whatsappSession.update({
    where: { id: sessionId },
    data: {
      refreshCount: nextCount,
      lastRefreshAt: new Date(),
    },
  });
};

/**
 * B4 — processWhatsappSessionStatus
 * Handles WAHA session.status webhook. Resolves sessionName → WhatsappSession + owning cashier.
 * Updates refresh counter on the session row (not Cashier).
 * Rotates (deletes) session on FAILED/STOPPED.
 */
const rotatingSessionIds = new Set<string>();

const NON_OPERATIONAL_WAHA_STATUSES = new Set([
  'UNLINKED',
  'STOPPED',
  'SCAN_QR_CODE',
  'FAILED',
]);

export const processWhatsappSessionStatusService = async (
  sessionName: string,
  status: string,
  occurredAt: Date,
) => {
  const sessionRow = await getSessionBySessionName(sessionName);
  if (!sessionRow) {
    logger.info({ event: 'waha_session_status_unknown', sessionName, status });
    return { matched: false as const };
  }

  const cashierId = sessionRow.cashier.id;
  const sessionId = sessionRow.id;

  const nonOperational = NON_OPERATIONAL_WAHA_STATUSES.has(status);
  if (nonOperational) {
    // Only end the work session if this was the LAST WORKING WhatsApp session.
    // Exclude the current session from the check because its live WAHA status
    // is the one transitioning right now.
    await finishWorkSessionIfNoWorkingWaha(cashierId, occurredAt, sessionId);
  }

  const shouldRotate = status === 'FAILED' || status === 'STOPPED';
  let rotated = false;

  if (shouldRotate && !rotatingSessionIds.has(sessionId)) {
    rotatingSessionIds.add(sessionId);
    try {
      await deleteSession(sessionName);
      await prisma.whatsappSession.delete({ where: { id: sessionId } });
      rotated = true;
    } catch (error) {
      logger.error({
        event: 'waha_session_rotation_failed',
        cashierId,
        sessionId,
        sessionName,
        status,
        err: error,
      });
    } finally {
      rotatingSessionIds.delete(sessionId);
    }
  }

  emitCashierRuntimeStateChanged(cashierId);

  return {
    matched: true as const,
    cashierId,
    sessionId,
    status,
    nonOperational,
    rotated,
  };
};

/**
 * B5 — disableCashierSessions
 * Cascades delete to all WhatsappSessions for a cashier.
 * WAHA delete is best-effort (per-session try/catch + log).
 * DB rows are always deleted.
 */
export const disableCashierSessions = async (cashierId: string) => {
  const sessions = await prisma.whatsappSession.findMany({
    where: { cashierId },
    select: { id: true, sessionName: true },
  });

  // Best-effort WAHA delete for each session
  for (const session of sessions) {
    try {
      await deleteSession(session.sessionName);
    } catch (error) {
      logger.error({
        event: 'waha_session_delete_failed_during_cashier_disable',
        cashierId,
        sessionId: session.id,
        sessionName: session.sessionName,
        err: error,
      });
    }
  }

  // Always delete DB rows (onDelete: Cascade removes WhatsappSessionLanding rows)
  await prisma.whatsappSession.deleteMany({ where: { cashierId } });

  return { deletedCount: sessions.length };
};

/**
 * B1 — deleteSession (single session admin operation)
 * Deletes WAHA session (best-effort) and removes DB row.
 */
export const deleteWhatsappSession = async (sessionId: string) => {
  const session = await prisma.whatsappSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new Error(SESSION_NOT_FOUND);
  }

  try {
    await deleteSession(session.sessionName);
  } catch (error) {
    logger.error({
      event: 'waha_session_delete_failed',
      sessionId,
      sessionName: session.sessionName,
      err: error,
    });
  }

  await prisma.whatsappSession.delete({ where: { id: sessionId } });

  // Only end the cashier's work session if this was the last WORKING session.
  // The row is already deleted so no exclude needed.
  await finishWorkSessionIfNoWorkingWaha(session.cashierId, new Date());

  return { id: sessionId, sessionName: session.sessionName };
};
