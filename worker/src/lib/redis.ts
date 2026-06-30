import { Redis } from 'ioredis';
import { config } from '../config/env.js';

let _client: Redis | null = null;

/**
 * Returns the shared ioredis client, lazily initialized on first call.
 * Uses BULLMQ_REDIS_URL so both BullMQ and Altcha replay-store share the
 * same Redis instance configuration.
 */
export function getRedisClient(): Redis {
  if (!_client) {
    _client = new Redis(config.BULLMQ_REDIS_URL, {
      // Queue commands until the connection is ready instead of throwing
      // "Stream isn't writeable" on the very first call (before connect completes).
      enableOfflineQueue: true,
      lazyConnect: false,
    });
    _client.on('error', () => {
      // Errors are handled at call-site; suppress unhandled-rejection noise.
    });
  }
  return _client;
}
