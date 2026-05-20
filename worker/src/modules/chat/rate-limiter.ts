/**
 * rate-limiter.ts
 *
 * Per-session token-bucket rate limiter for outbound chat messages.
 *
 * Design §6 (confirmed numbers):
 *   capacity:          10 tokens (burst)
 *   refillIntervalMs:  500ms per token (≈ 2 tokens/sec sustained)
 *
 * text + photo sends share the same bucket per sessionId.
 * Reactions are NOT rate-limited (bypassed in the service layer).
 *
 * V1 LIMITATION: in-process Map — does not survive horizontal scaling.
 * V2 upgrade path: replace with Redis INCRBY + TTL (Redis is already in infra).
 *
 * Clock injection (`nowFn`) makes the limiter deterministically testable without
 * real timers or sleep.
 */

export type RateLimiterOptions = {
  /** Maximum tokens (burst capacity). Default: 10. */
  capacity?: number;
  /** Milliseconds between each token refill. Default: 500 (= 2 tokens/sec). */
  refillIntervalMs?: number;
  /** Injectable clock — returns current timestamp in ms. Default: Date.now. */
  nowFn?: () => number;
};

type Bucket = {
  tokens: number;
  lastRefillAt: number;
};

export type RateLimiter = {
  /**
   * Tries to consume 1 token for the given sessionId.
   * Returns true if a token was available (proceed), false if the bucket is
   * empty (caller should return HTTP 429 ChatRateLimitError).
   *
   * Refills tokens proportional to time elapsed since last call before consuming.
   */
  tryConsume(sessionId: string): boolean;
};

export function createRateLimiter(opts: RateLimiterOptions = {}): RateLimiter {
  const capacity = opts.capacity ?? 10;
  const refillIntervalMs = opts.refillIntervalMs ?? 500;
  const nowFn = opts.nowFn ?? Date.now;

  // V1 LIMITATION: single-process in-memory state. Horizontal scaling will
  // cause each worker instance to maintain independent token buckets per session,
  // effectively multiplying the allowed burst by the number of instances.
  // V2: replace with Redis INCRBY + TTL.
  const buckets = new Map<string, Bucket>();

  function getBucket(sessionId: string, now: number): Bucket {
    const existing = buckets.get(sessionId);
    if (existing) return existing;

    const fresh: Bucket = { tokens: capacity, lastRefillAt: now };
    buckets.set(sessionId, fresh);
    return fresh;
  }

  function refill(bucket: Bucket, now: number): void {
    const elapsed = now - bucket.lastRefillAt;
    const tokensToAdd = Math.floor(elapsed / refillIntervalMs);
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefillAt += tokensToAdd * refillIntervalMs;
    }
  }

  return {
    tryConsume(sessionId: string): boolean {
      const now = nowFn();
      const bucket = getBucket(sessionId, now);
      refill(bucket, now);

      if (bucket.tokens <= 0) {
        return false;
      }

      bucket.tokens -= 1;
      return true;
    },
  };
}
