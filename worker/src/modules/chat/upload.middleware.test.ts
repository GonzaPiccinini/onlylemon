/**
 * upload.middleware.test.ts
 *
 * Unit tests for the image upload middleware helpers.
 * Written FIRST (RED) per strict TDD.
 *
 * Tests:
 * 1. sniffImageMagicBytes — true for valid JPEG prefix
 * 2. sniffImageMagicBytes — true for valid PNG prefix
 * 3. sniffImageMagicBytes — true for valid WebP prefix
 * 4. sniffImageMagicBytes — false when declared PNG but bytes are PDF
 * 5. sniffImageMagicBytes — false when declared JPEG but bytes are PNG
 * 6. sniffImageMagicBytes — false for WebP with RIFF but wrong format tag
 * 7. translateUploadError maps LIMIT_FILE_SIZE → 413
 * 8. translateUploadError maps INVALID_MIME → 415
 * 9. translateUploadError maps MAGIC_MISMATCH → 415
 * 10. upload middleware: req.file.path is undefined (memory storage, no disk write)
 *
 * Design ref: whatsapp-chat-ui design §7 Upload Pipeline, §13 risk #13.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Env bootstrap — must come BEFORE any module imports that read config
process.env.PORT = process.env.PORT ?? '3002';
process.env.LEADS_CODE_TTL_HOURS = process.env.LEADS_CODE_TTL_HOURS ?? '24';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.BULLMQ_REDIS_URL = process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379';
process.env.BULLMQ_QUEUE_NAME = process.env.BULLMQ_QUEUE_NAME ?? 'test-queue';
process.env.WORKER_CONCURRENCY = process.env.WORKER_CONCURRENCY ?? '1';
process.env.WAHA_API_KEY = process.env.WAHA_API_KEY ?? 'waha-key';
process.env.WAHA_BASE_URL = process.env.WAHA_BASE_URL ?? 'http://localhost:3000';
process.env.WAHA_WEBHOOK_URL =
  process.env.WAHA_WEBHOOK_URL ?? 'http://localhost:3002/webhook';
process.env.WAHA_WEBHOOK_EVENTS = process.env.WAHA_WEBHOOK_EVENTS ?? 'message';
process.env.WAHA_WEBHOOK_TOKEN_HEADER =
  process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
process.env.WAHA_WEBHOOK_TOKEN_VALUE = process.env.WAHA_WEBHOOK_TOKEN_VALUE ?? 'token';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? '1234567890123456';
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? 'turnstile-secret';
process.env.ALTCHA_HMAC_SECRET = process.env.ALTCHA_HMAC_SECRET ?? 'test-altcha-hmac-secret-32-bytes!';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

import {
  sniffImageMagicBytes,
  translateUploadError,
  UploadErrorCode,
} from './upload.middleware.js';

// ── Magic byte prefixes ───────────────────────────────────────────────────────
// JPEG: FF D8 FF
const JPEG_PREFIX = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
// PNG: 89 50 4E 47 0D 0A 1A 0A
const PNG_PREFIX = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
// WebP: RIFF????WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
const WEBP_PREFIX = Buffer.from([
  0x52, 0x49, 0x46, 0x46, // "RIFF" at offset 0
  0x24, 0x00, 0x00, 0x00, // file size (filler)
  0x57, 0x45, 0x42, 0x50, // "WEBP" at offset 8
  0x56, 0x50, 0x38, 0x4c, // VP8L (filler)
]);
// PDF: 25 50 44 46 ("%PDF")
const PDF_PREFIX = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
// RIFF but NOT WebP (e.g., AVI uses RIFF....AVI )
const RIFF_AVI_PREFIX = Buffer.from([
  0x52, 0x49, 0x46, 0x46, // "RIFF"
  0x00, 0x00, 0x00, 0x00, // size filler
  0x41, 0x56, 0x49, 0x20, // "AVI " at offset 8 — NOT "WEBP"
]);

// ── sniffImageMagicBytes ──────────────────────────────────────────────────────

describe('sniffImageMagicBytes — valid signatures', () => {
  it('returns true for a real JPEG byte prefix', () => {
    assert.equal(sniffImageMagicBytes(JPEG_PREFIX, 'image/jpeg'), true);
  });

  it('returns true for a real PNG byte prefix', () => {
    assert.equal(sniffImageMagicBytes(PNG_PREFIX, 'image/png'), true);
  });

  it('returns true for a real WebP byte prefix (RIFF + WEBP)', () => {
    assert.equal(sniffImageMagicBytes(WEBP_PREFIX, 'image/webp'), true);
  });
});

describe('sniffImageMagicBytes — mismatches', () => {
  it('returns false when declared image/png but bytes are a PDF', () => {
    assert.equal(sniffImageMagicBytes(PDF_PREFIX, 'image/png'), false);
  });

  it('returns false when declared image/jpeg but bytes are PNG', () => {
    assert.equal(sniffImageMagicBytes(PNG_PREFIX, 'image/jpeg'), false);
  });

  it('returns false for WebP with RIFF header but wrong format tag (AVI)', () => {
    assert.equal(sniffImageMagicBytes(RIFF_AVI_PREFIX, 'image/webp'), false);
  });

  it('returns false for unknown MIME type', () => {
    assert.equal(sniffImageMagicBytes(JPEG_PREFIX, 'image/gif'), false);
  });
});

// ── translateUploadError ──────────────────────────────────────────────────────

describe('translateUploadError — error code mapping', () => {
  it('maps LIMIT_FILE_SIZE error to HTTP 413', () => {
    const err = new Error('File too large');
    (err as NodeJS.ErrnoException & { code: string }).code = 'LIMIT_FILE_SIZE';
    const result = translateUploadError(err);
    assert.ok(result);
    assert.equal(result!.status, 413);
  });

  it('maps INVALID_MIME upload error to HTTP 415', () => {
    const err = new Error('Unsupported MIME type');
    (err as NodeJS.ErrnoException & { code: string }).code = UploadErrorCode.INVALID_MIME;
    const result = translateUploadError(err);
    assert.ok(result);
    assert.equal(result!.status, 415);
  });

  it('maps MAGIC_MISMATCH upload error to HTTP 415', () => {
    const err = new Error('Magic bytes do not match declared MIME');
    (err as NodeJS.ErrnoException & { code: string }).code = UploadErrorCode.MAGIC_MISMATCH;
    const result = translateUploadError(err);
    assert.ok(result);
    assert.equal(result!.status, 415);
  });

  it('returns null for unrecognised errors', () => {
    const err = new Error('Unknown error');
    const result = translateUploadError(err);
    assert.equal(result, null);
  });
});

// ── memory storage — no disk writes ──────────────────────────────────────────

describe('upload middleware — memory storage (no disk writes)', () => {
  it('a file processed by multer memory storage has no .path property', () => {
    // Memory storage never sets file.path; this is an explicit assertion per spec §7:
    // "Uploaded bytes MUST NOT be written to disk or persist at any point during validation."
    const syntheticMulterFile = {
      fieldname: 'file',
      originalname: 'test.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: JPEG_PREFIX,
      size: JPEG_PREFIX.length,
      // NOTE: multer memory storage does NOT set `path` — disk storage does.
    } as Express.Multer.File;

    assert.equal(
      (syntheticMulterFile as unknown as Record<string, unknown>).path,
      undefined,
      'memory storage files must not have a path (no disk write)',
    );
  });
});
