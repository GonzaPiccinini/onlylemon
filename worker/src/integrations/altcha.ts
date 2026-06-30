import { createChallenge, verifySolution } from 'altcha-lib/v1';
import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { getRedisClient } from '../lib/redis.js';

const REPLAY_TTL_SECONDS = 700; // slightly more than 10-minute challenge expiry

export type AltchaChallenge = {
  algorithm: string;
  challenge: string;
  maxnumber?: number;
  salt: string;
  signature: string;
};

/**
 * Function signature for the one-time replay store operation.
 * Returns true if the key was newly set (first use), false if it already existed (replay).
 * Injected in production from `getRedisClient()`, mocked in unit tests.
 */
export type ReplayStoreFn = (key: string, ttlSeconds: number) => Promise<boolean>;

async function defaultReplayStore(key: string, ttlSeconds: number): Promise<boolean> {
  const result = await getRedisClient().set(key, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

/**
 * Creates a signed Altcha challenge valid for ~10 minutes.
 * The HMAC secret never leaves the server.
 */
export async function createAltchaChallenge(): Promise<AltchaChallenge> {
  return createChallenge({
    hmacKey: config.ALTCHA_HMAC_SECRET,
    expires: new Date(Date.now() + 600_000), // 10 minutes
    maxnumber: 50_000, // Lowered from default (1M) so client pre-solve completes in <1s
  });
}

/**
 * Verifies a client-submitted Altcha payload.
 *
 * Steps:
 * 1. Verify the HMAC signature and check that the challenge has not expired.
 * 2. Extract the `signature` field as the replay key.
 * 3. Perform a Redis SET NX to enforce one-time use.
 *
 * Returns false for invalid signature, expired challenge, or replay.
 */
export async function verifyCaptcha(
  payload: string,
  _ip?: string,
  replayStore: ReplayStoreFn = defaultReplayStore,
): Promise<boolean> {
  // Step 1: verify signature and expiry
  let valid: boolean;
  try {
    valid = await verifySolution(payload, config.ALTCHA_HMAC_SECRET, true);
  } catch {
    return false;
  }
  if (!valid) return false;

  // Step 2: extract challenge signature for one-time replay key
  let signature: string;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as {
      signature?: string;
    };
    if (!decoded.signature || typeof decoded.signature !== 'string') return false;
    signature = decoded.signature;
  } catch {
    return false;
  }

  // Step 3: one-time use via Redis SET NX. A store outage must NEVER crash the
  // request handler — the payload is already HMAC-verified and expires in ~10min,
  // so we fail open (allow) and log, rather than 500-ing/crashing on lead capture.
  const replayKey = `altcha:replay:${signature}`;
  try {
    return await replayStore(replayKey, REPLAY_TTL_SECONDS); // false → already existed → replay rejected
  } catch (err) {
    logger.warn({ err }, 'altcha replay store unavailable; allowing without replay check');
    return true;
  }
}
