/**
 * require-session-ownership.middleware.ts
 *
 * Express middleware that enforces cashier ownership of a WhatsApp session.
 *
 * Behaviour:
 * - Reads `req.params.sessionId`.
 * - Looks up the WhatsappSession by id (injectable dep for testability).
 * - 404 when session not found.
 * - CASHIER role: 403 when session.cashierId !== req.authUser.cashierId.
 * - ADMIN / SUPER_ADMIN: always pass (flat scope).
 * - On pass: attaches the resolved session to `req.resolvedSession` so the
 *   controller does not need to re-query the DB.
 *
 * Design ref: whatsapp-chat-ui design §5 (requireSessionOwnership middleware).
 */

import type { NextFunction, Request, Response } from 'express';

// ── Domain type for the resolved session ─────────────────────────────────────

export type SessionOwnershipSession = {
  id: string;
  sessionName: string;
  cashierId: string;
};

// ── req.resolvedSession augmentation ─────────────────────────────────────────
// Extends the global Express Request type (alongside the existing authUser).
declare global {
  namespace Express {
    interface Request {
      resolvedSession?: SessionOwnershipSession;
    }
  }
}

// ── Factory deps ──────────────────────────────────────────────────────────────

export type RequireSessionOwnershipDeps = {
  /** Resolves a WhatsappSession by DB id, or null when not found. */
  getWhatsappSession(sessionId: string): Promise<SessionOwnershipSession | null>;
};

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Returns an Express middleware that enforces cashier ownership.
 *
 * Usage:
 *   const mw = createRequireSessionOwnership({ getWhatsappSession });
 *   router.use('/sessions/:sessionId', requireAuth, requireRole('CASHIER'), mw);
 */
export function createRequireSessionOwnership(
  deps: RequireSessionOwnershipDeps,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async function requireSessionOwnership(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const { sessionId } = req.params;

    const session = await deps.getWhatsappSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Admin routes carry a :cashierId in the path. It used to be ignored (only
    // :sessionId mattered), which silently masked mismatched URLs. Enforce that
    // the session actually belongs to that cashier so a wrong pairing surfaces as
    // 404 instead of operating on a session that doesn't match the path. No-op on
    // routes without :cashierId (cashier-scoped routes).
    const pathCashierId = req.params.cashierId;
    if (pathCashierId !== undefined && session.cashierId !== pathCashierId) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const authUser = req.authUser;
    const role = authUser?.role;

    // ADMIN and SUPER_ADMIN bypass ownership check — flat scope.
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      req.resolvedSession = session;
      next();
      return;
    }

    // CASHIER: enforce ownership.
    if (session.cashierId !== authUser?.cashierId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    req.resolvedSession = session;
    next();
  };
}

// ── Default wiring ─────────────────────────────────────────────────────────────

/**
 * Creates the middleware wired to the real Prisma client.
 * Call lazily (not at module load time) to avoid top-level DB imports.
 */
export async function createDefaultRequireSessionOwnership(): Promise<
  (req: Request, res: Response, next: NextFunction) => Promise<void>
> {
  const { prisma } = await import('../persistence/prisma/client.js');

  return createRequireSessionOwnership({
    getWhatsappSession: async (sessionId) => {
      const row = await prisma.whatsappSession.findUnique({
        where: { id: sessionId },
        select: { id: true, sessionName: true, cashierId: true },
      });
      return row;
    },
  });
}
