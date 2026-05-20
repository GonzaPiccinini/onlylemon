/**
 * Pure helper functions for the chat SSE stream handler.
 *
 * Extracted here so they can be unit-tested independently of Express
 * request/response objects and the event bus.
 */

import type { AuthenticatedUser } from '../../types/api.js';
import type { ChatMessageEvent, ChatReactionEvent } from '../chat/chat.types.js';

/** Minimal shape we need from the DB record returned by listCashiers(). */
export type CashierRecord = { id: string };

/**
 * Resolve the set of cashierIds visible to a connected SSE client.
 *
 * - CASHIER: only their own cashierId (throws if absent — 403 scenario).
 * - ADMIN / SUPER_ADMIN: all cashierIds from listCashiers(), resolved ONCE
 *   at connect time and cached on the connection.
 */
export const resolveVisibleCashierIds = async (
  authUser: AuthenticatedUser,
  listCashiers: () => Promise<CashierRecord[]>,
): Promise<Set<string>> => {
  if (authUser.role === 'CASHIER') {
    if (!authUser.cashierId) {
      throw new Error('CASHIER JWT is missing cashierId — cannot open chat stream');
    }
    return new Set([authUser.cashierId]);
  }

  // ADMIN or SUPER_ADMIN: resolve all cashiers from DB once at connect
  const cashiers = await listCashiers();
  return new Set(cashiers.map((c) => c.id));
};

/**
 * Returns true when the bus event's cashierId belongs to the connection's
 * visible set. Works for both ChatMessageEvent and ChatReactionEvent since
 * both carry a top-level `cashierId`.
 */
export const isEventVisible = (
  event: ChatMessageEvent | ChatReactionEvent,
  visibleSet: Set<string>,
): boolean => visibleSet.has(event.cashierId);
