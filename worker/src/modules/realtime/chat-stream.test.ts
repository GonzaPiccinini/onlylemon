/**
 * Tests for the chat SSE stream pure helpers.
 * Strict TDD: these tests were written FIRST (RED) before the implementation.
 *
 * Covers:
 *   - resolveVisibleCashierIds: CASHIER, ADMIN, SUPER_ADMIN, CASHIER with no cashierId
 *   - isEventVisible: event in set, event not in set
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveVisibleCashierIds,
  isEventVisible,
} from './chat-stream.helpers.js';

import type { AuthenticatedUser } from '../../types/api.js';
import type { ChatMessageEvent, ChatReactionEvent } from '../chat/chat.types.js';

// ── resolveVisibleCashierIds ──────────────────────────────────────────────────

describe('resolveVisibleCashierIds', () => {
  it('CASHIER — returns a set containing only their own cashierId', async () => {
    const user: AuthenticatedUser = { userId: 'u1', role: 'CASHIER', cashierId: 'c1' };
    const listCashiers = mock.fn(async () => []);

    const result = await resolveVisibleCashierIds(user, listCashiers);

    assert.deepStrictEqual(result, new Set(['c1']));
    // listCashiers should NOT be called for CASHIER
    assert.strictEqual(listCashiers.mock.calls.length, 0);
  });

  it('CASHIER without cashierId — throws with a 403-appropriate error', async () => {
    const user: AuthenticatedUser = { userId: 'u1', role: 'CASHIER' };
    const listCashiers = mock.fn(async () => []);

    await assert.rejects(
      () => resolveVisibleCashierIds(user, listCashiers),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /cashierId/i);
        return true;
      },
    );
  });

  it('ADMIN — calls listCashiers and returns all cashier ids', async () => {
    const user: AuthenticatedUser = { userId: 'u2', role: 'ADMIN' };
    const cashiers = [{ id: 'c10' }, { id: 'c11' }, { id: 'c12' }];
    const listCashiers = mock.fn(async () => cashiers);

    const result = await resolveVisibleCashierIds(user, listCashiers);

    assert.deepStrictEqual(result, new Set(['c10', 'c11', 'c12']));
    assert.strictEqual(listCashiers.mock.calls.length, 1);
  });

  it('SUPER_ADMIN — calls listCashiers and returns all cashier ids', async () => {
    const user: AuthenticatedUser = { userId: 'u3', role: 'SUPER_ADMIN' };
    const cashiers = [{ id: 'cA' }, { id: 'cB' }];
    const listCashiers = mock.fn(async () => cashiers);

    const result = await resolveVisibleCashierIds(user, listCashiers);

    assert.deepStrictEqual(result, new Set(['cA', 'cB']));
    assert.strictEqual(listCashiers.mock.calls.length, 1);
  });

  it('ADMIN — zero cashiers returns an empty set', async () => {
    const user: AuthenticatedUser = { userId: 'u4', role: 'ADMIN' };
    const listCashiers = mock.fn(async () => []);

    const result = await resolveVisibleCashierIds(user, listCashiers);

    assert.deepStrictEqual(result, new Set());
  });
});

// ── isEventVisible ────────────────────────────────────────────────────────────

describe('isEventVisible', () => {
  const visibleSet = new Set(['cashierA', 'cashierB']);

  it('returns true when event.cashierId is in the visible set (message event)', () => {
    const event = {
      cashierId: 'cashierA',
      sessionId: 's1',
      sessionName: 'session1',
      chatId: 'ch1',
      message: {} as ChatMessageEvent['message'],
    } satisfies ChatMessageEvent;

    assert.strictEqual(isEventVisible(event, visibleSet), true);
  });

  it('returns false when event.cashierId is NOT in the visible set (message event)', () => {
    const event = {
      cashierId: 'cashierC',
      sessionId: 's1',
      sessionName: 'session1',
      chatId: 'ch1',
      message: {} as ChatMessageEvent['message'],
    } satisfies ChatMessageEvent;

    assert.strictEqual(isEventVisible(event, visibleSet), false);
  });

  it('returns true for a reaction event whose cashierId is in the visible set', () => {
    const event: ChatReactionEvent = {
      cashierId: 'cashierB',
      sessionId: 's2',
      sessionName: 'session2',
      chatId: 'ch2',
      messageId: 'm1',
      emoji: '👍',
      fromMe: true,
    };

    assert.strictEqual(isEventVisible(event, visibleSet), true);
  });

  it('returns false for a reaction event whose cashierId is NOT in the visible set', () => {
    const event: ChatReactionEvent = {
      cashierId: 'cashierX',
      sessionId: 's2',
      sessionName: 'session2',
      chatId: 'ch2',
      messageId: 'm1',
      emoji: '😢',
      fromMe: false,
    };

    assert.strictEqual(isEventVisible(event, visibleSet), false);
  });

  it('returns false when the visible set is empty', () => {
    const event: ChatReactionEvent = {
      cashierId: 'cashierA',
      sessionId: 's1',
      sessionName: 'session1',
      chatId: 'ch1',
      messageId: 'm1',
      emoji: '👍',
      fromMe: false,
    };

    assert.strictEqual(isEventVisible(event, new Set()), false);
  });
});
