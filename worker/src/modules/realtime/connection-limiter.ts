/**
 * Per-key concurrent-connection limiter for SSE streams.
 *
 * Each authenticated user may hold at most `maxPerKey` simultaneous SSE
 * connections. Without this, a single authenticated user could open unbounded
 * streams (each one adds listeners + a heartbeat timer), a memory/DoS vector.
 *
 * In-process only (matches the single-process V1 of the rate limiter). Keys are
 * dropped once their count returns to zero so the Map cannot grow unbounded.
 */
export type ConnectionLimiter = {
  /** Register a new connection for `key`. Returns false if already at capacity. */
  tryAcquire(key: string): boolean;
  /** Release one connection for `key` (safe to call even at zero). */
  release(key: string): void;
  /** Current open-connection count for `key` (0 if none). */
  count(key: string): number;
  /** Number of keys currently tracked (observability/tests). */
  size(): number;
};

export function createConnectionLimiter(maxPerKey: number): ConnectionLimiter {
  const counts = new Map<string, number>();

  return {
    tryAcquire(key: string): boolean {
      const current = counts.get(key) ?? 0;
      if (current >= maxPerKey) return false;
      counts.set(key, current + 1);
      return true;
    },
    release(key: string): void {
      const current = counts.get(key) ?? 0;
      if (current <= 1) {
        counts.delete(key);
      } else {
        counts.set(key, current - 1);
      }
    },
    count(key: string): number {
      return counts.get(key) ?? 0;
    },
    size(): number {
      return counts.size;
    },
  };
}
