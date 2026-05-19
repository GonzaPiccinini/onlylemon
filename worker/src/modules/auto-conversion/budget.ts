/**
 * auto-conversion/budget.ts
 *
 * Redis-based OCR daily budget tracker.
 * Uses a factory pattern for dependency injection — the Redis client is passed
 * in, enabling unit tests to use a stub without opening a real connection.
 *
 * Production usage: pass the BullMQ Redis connection (ioredis instance) or any
 * compatible client that implements incr/expire.
 *
 * Budget key format: ocr_calls:{cashierId}:{YYYY-MM-DD} (UTC date).
 * TTL: 86400 seconds (24h), set only on the first call of the day (INCR === 1).
 */

import { BudgetExceededError } from './errors.js';

// ---------------------------------------------------------------------------
// Minimal Redis interface (subset of ioredis / compatible clients)
// ---------------------------------------------------------------------------

export interface RedisClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

// ---------------------------------------------------------------------------
// Factory options
// ---------------------------------------------------------------------------

export interface BudgetCheckerOptions {
  /** Maximum OCR calls per cashier per UTC day (default: env AUTO_OCR_DAILY_LIMIT or 100) */
  dailyLimit: number;
  /** Injectable clock — default: () => new Date(). Allows deterministic tests. */
  now?: () => Date;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a budget checker bound to the given Redis client and options.
 *
 * @param redis - Redis client with incr and expire methods
 * @param options - dailyLimit and optional now clock
 * @returns An object with checkAndIncrement(cashierId)
 */
export function createBudgetChecker(
  redis: RedisClient,
  options: BudgetCheckerOptions,
): {
  checkAndIncrement(cashierId: string): Promise<void>;
} {
  const { dailyLimit, now = () => new Date() } = options;

  return {
    async checkAndIncrement(cashierId: string): Promise<void> {
      const date = now();
      // Always use UTC date to avoid timezone-dependent key drift
      const dateKey = date.toISOString().slice(0, 10); // "YYYY-MM-DD"
      const key = `ocr_calls:${cashierId}:${dateKey}`;

      // INCR returns the new value after increment
      const count = await redis.incr(key);

      // Only set TTL on the very first call of the day to avoid resetting expiry
      if (count === 1) {
        await redis.expire(key, 86400);
      }

      // Check AFTER incrementing (count the current call against the limit)
      if (count > dailyLimit) {
        throw new BudgetExceededError(
          `Daily OCR limit of ${dailyLimit} reached for cashier ${cashierId}`,
        );
      }
    },
  };
}
