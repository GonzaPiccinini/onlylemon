import { hash, verify } from '@node-rs/argon2';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Argon2id parameters following the OWASP Password Storage Cheat Sheet minimum
 * (m=19456 KiB, t=2, p=1). Argon2id is the library default algorithm, so it is
 * not set explicitly.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Hash a plaintext password with Argon2id. Output is self-describing (`$argon2id$...`). */
export const hashPassword = (password: string): Promise<string> =>
  hash(password, ARGON2_OPTIONS);

/**
 * Legacy hashing: unsalted SHA-256. Kept ONLY to verify pre-Argon2 credentials
 * so they can be transparently upgraded on the next successful login. Never used
 * to produce new hashes.
 */
const legacySha256 = (password: string): string =>
  createHash('sha256').update(password).digest('hex');

const isArgon2Hash = (stored: string): boolean => stored.startsWith('$argon2');

export interface PasswordVerification {
  /** Whether the supplied password matches the stored hash. */
  valid: boolean;
  /**
   * True when a valid password was checked against a legacy (SHA-256) hash and
   * should be re-hashed with Argon2id by the caller.
   */
  needsRehash: boolean;
}

/**
 * Verify a password against a stored hash. Transparently supports both Argon2id
 * hashes and legacy unsalted SHA-256 hashes. When a legacy hash matches,
 * `needsRehash` is true so the caller can upgrade the stored hash to Argon2id.
 */
export const verifyPassword = async (
  password: string,
  storedHash: string,
): Promise<PasswordVerification> => {
  if (isArgon2Hash(storedHash)) {
    // A corrupted/truncated Argon2 digest makes verify() throw — treat that as a
    // failed authentication rather than letting it surface as a 500.
    try {
      const valid = await verify(storedHash, password);
      return { valid, needsRehash: false };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  // Legacy SHA-256 path — constant-time digest comparison.
  const candidate = Buffer.from(legacySha256(password), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  const valid =
    candidate.length === stored.length && timingSafeEqual(candidate, stored);
  return { valid, needsRehash: valid };
};
