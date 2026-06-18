/**
 * Wraps an async factory so it runs at most once, even under concurrent callers.
 *
 * The in-flight (and then resolved) promise is cached and shared by every caller,
 * so a burst of requests arriving during initialization triggers a SINGLE factory
 * run rather than one per request. This is what the lazy chat-router init needs:
 * without it, requests that land before the first init resolves each build their
 * own ChatService (and its own rate-limiter), momentarily multiplying the limits.
 *
 * If the factory rejects, the cache is cleared so a later call retries instead of
 * being stuck forever with a permanently rejected promise.
 */
export function memoizeAsync<T>(factory: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;

  return () => {
    if (!cached) {
      cached = factory().catch((err) => {
        cached = null;
        throw err;
      });
    }
    return cached;
  };
}
