/**
 * s3/client.ts
 *
 * R2/S3 integration — delete objects from Cloudflare R2.
 *
 * Pattern mirrors openai/client.ts (lazy, env-at-call-time):
 * - Credentials are read from process.env at call time, not at module load.
 * - Throws R2NotConfiguredError if any required credential is missing.
 * - deleteObject accepts an optional pre-built S3Client for testability.
 */

import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

export class R2NotConfiguredError extends Error {
  constructor(message = 'R2 credentials missing (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT required)') {
    super(message);
    this.name = 'R2NotConfiguredError';
  }
}

/**
 * Builds a fresh S3Client from current process.env values.
 * Throws R2NotConfiguredError if any required credential is absent.
 */
function getClient(): S3Client {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  const region = process.env.R2_REGION ?? 'auto';

  if (!accessKeyId || !secretAccessKey || !endpoint) {
    const missing = [
      !accessKeyId && 'R2_ACCESS_KEY_ID',
      !secretAccessKey && 'R2_SECRET_ACCESS_KEY',
      !endpoint && 'R2_ENDPOINT',
    ]
      .filter(Boolean)
      .join(', ');
    throw new R2NotConfiguredError(
      `R2 credentials missing (${missing} required)`,
    );
  }

  return new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true, // R2 requires path-style URLs
  });
}

/**
 * Deletes an object from R2/S3.
 *
 * @param bucket  - The S3/R2 bucket name.
 * @param key     - The object key (path) within the bucket.
 * @param client  - Optional pre-built S3Client (for testing). If omitted, reads env at call time.
 *
 * Throws R2NotConfiguredError if credentials are missing (when using the default client).
 * Bubbles up any SDK errors — callers are responsible for error handling.
 */
export async function deleteObject(
  bucket: string,
  key: string,
  client: S3Client = getClient(),
): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
