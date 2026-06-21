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
  /**
   * Idle time after which a bucket is evicted to bound memory. Defaults to
   * `capacity * refillIntervalMs` — the time an empty bucket takes to refill back
   * to full. At/after that point the bucket is full, so evicting and lazily
   * recreating it yields an identical full bucket (no extra burst is granted).
   * Setting this BELOW the full-refill time would let a client reset their limit
   * early by going briefly idle — don't.
   */
  idleTtlMs?: number;
  /**
   * Minimum time between opportunistic eviction sweeps. Default: `idleTtlMs`.
   * Sweeps run lazily inside tryConsume (no background timer) so the limiter
   * stays deterministically testable and never keeps the event loop alive.
   */
  sweepIntervalMs?: number;
};

type Bucket = {
  tokens: number;
  lastRefillAt: number;
  /** Last time this bucket was touched — drives idle eviction. */
  lastAccessAt: number;
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
  /** Number of live buckets currently held in memory (observability/tests). */
  size(): number;
};

export function createRateLimiter(opts: RateLimiterOptions = {}): RateLimiter {
  const capacity = opts.capacity ?? 10;
  const refillIntervalMs = opts.refillIntervalMs ?? 500;
  const nowFn = opts.nowFn ?? Date.now;
  const idleTtlMs = opts.idleTtlMs ?? capacity * refillIntervalMs;
  const sweepIntervalMs = opts.sweepIntervalMs ?? idleTtlMs;

  // V1 LIMITATION: single-process in-memory state. Horizontal scaling will
  // cause each worker instance to maintain independent token buckets per session,
  // effectively multiplying the allowed burst by the number of instances.
  // V2: replace with Redis INCRBY + TTL.
  const buckets = new Map<string, Bucket>();
  let lastSweepAt = nowFn();

  function getBucket(sessionId: string, now: number): Bucket {
    const existing = buckets.get(sessionId);
    if (existing) return existing;

    const fresh: Bucket = { tokens: capacity, lastRefillAt: now, lastAccessAt: now };
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

  // Opportunistic sweep: drop buckets idle past idleTtlMs (they've refilled to
  // full, so dropping them is a no-op for the next caller). Rate-limited to once
  // per sweepIntervalMs so a busy limiter doesn't pay an O(n) scan every call.
  function maybeSweep(now: number): void {
    if (now - lastSweepAt < sweepIntervalMs) return;
    lastSweepAt = now;
    for (const [sessionId, bucket] of buckets) {
      if (now - bucket.lastAccessAt >= idleTtlMs) {
        buckets.delete(sessionId);
      }
    }
  }

  return {
    tryConsume(sessionId: string): boolean {
      const now = nowFn();
      maybeSweep(now);

      const bucket = getBucket(sessionId, now);
      bucket.lastAccessAt = now;
      refill(bucket, now);

      if (bucket.tokens <= 0) {
        return false;
      }

      bucket.tokens -= 1;
      return true;
    },
    size(): number {
      return buckets.size;
    },
  };
}
