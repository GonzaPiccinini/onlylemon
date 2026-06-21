/**
 * upload.middleware.ts
 *
 * Multipart upload middleware for the photo-send route.
 *
 * Key guarantees:
 *   - MEMORY STORAGE ONLY — no bytes are written to disk at any point during
 *     upload or validation. multer.memoryStorage() is the sole storage engine
 *     used here. Confirmation: req.file.path is always undefined for memory
 *     storage files (disk storage sets this field; memory storage does not).
 *   - 5 MB maximum file size (LIMIT_FILE_SIZE → HTTP 413).
 *   - MIME allowlist: image/jpeg, image/png, image/webp (others → HTTP 415).
 *   - Magic-byte verification after upload parsing (see sniffImageMagicBytes).
 *     JPEG: FF D8 FF
 *     PNG:  89 50 4E 47 0D 0A 1A 0A
 *     WebP: bytes 0-3 = RIFF ("RIFF") AND bytes 8-11 = WEBP ("WEBP")
 *     The WebP check requires BOTH offsets — RIFF alone matches AVI/WAV/etc.
 *
 * Design ref: whatsapp-chat-ui design §7 Upload Pipeline, §13 risk #12/#13.
 * Spec ref: security/uploads — Image Upload Validation.
 */

import multer from 'multer';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/** MIME types accepted by the allowlist (photo-send only). */
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// ── Error codes (exported for use in error-translation + tests) ───────────────

export const UploadErrorCode = {
  /** Declared MIME type not in allowlist. Maps to HTTP 415. */
  INVALID_MIME: 'INVALID_MIME',
  /** Declared MIME does not match magic bytes. Maps to HTTP 415. */
  MAGIC_MISMATCH: 'MAGIC_MISMATCH',
} as const;

export type UploadErrorCodeType = typeof UploadErrorCode[keyof typeof UploadErrorCode];

// ── Magic-byte sniffer ────────────────────────────────────────────────────────

/**
 * Returns true if the first bytes of `buffer` match the magic signature for
 * the declared MIME type.
 *
 * Recognised signatures:
 *   image/jpeg — starts with FF D8 FF
 *   image/png  — starts with 89 50 4E 47 0D 0A 1A 0A
 *   image/webp — bytes 0-3 = 52 49 46 46 ("RIFF") AND bytes 8-11 = 57 45 42 50 ("WEBP")
 *
 * Returns false for any other declared MIME (outside allowlist).
 *
 * Design ref: §7.4 magic-byte signature table; §13 risk #13 (WebP BOTH offsets required).
 */
export function sniffImageMagicBytes(buffer: Buffer, declaredMime: string): boolean {
  switch (declaredMime) {
    case 'image/jpeg': {
      // FF D8 FF
      return (
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
      );
    }
    case 'image/png': {
      // 89 50 4E 47 0D 0A 1A 0A
      return (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      );
    }
    case 'image/webp': {
      // MUST check BOTH:
      //   bytes 0-3: 52 49 46 46 ("RIFF") — also present in AVI/WAV
      //   bytes 8-11: 57 45 42 50 ("WEBP")
      return (
        buffer.length >= 12 &&
        buffer[0] === 0x52 && // R
        buffer[1] === 0x49 && // I
        buffer[2] === 0x46 && // F
        buffer[3] === 0x46 && // F
        buffer[8] === 0x57 && // W
        buffer[9] === 0x45 && // E
        buffer[10] === 0x42 && // B
        buffer[11] === 0x50   // P
      );
    }
    default:
      return false;
  }
}

// ── Error translation ─────────────────────────────────────────────────────────

type UploadErrorResult = { status: 413 | 415; message: string } | null;

/**
 * Translates a known upload error (multer LIMIT_FILE_SIZE, or our custom
 * INVALID_MIME / MAGIC_MISMATCH codes) to an HTTP status + message pair.
 *
 * Returns null for unrecognised errors (caller should treat as 500).
 */
export function translateUploadError(err: unknown): UploadErrorResult {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException & { code?: string }).code;
    if (code === 'LIMIT_FILE_SIZE') {
      return { status: 413, message: 'File too large — maximum size is 5 MB' };
    }
    if (code === UploadErrorCode.INVALID_MIME) {
      return { status: 415, message: 'Unsupported MIME type — allowed: image/jpeg, image/png, image/webp' };
    }
    if (code === UploadErrorCode.MAGIC_MISMATCH) {
      return { status: 415, message: 'File content does not match declared MIME type' };
    }
  }
  return null;
}

// ── Multer configuration ──────────────────────────────────────────────────────

/**
 * Configured multer instance.
 *
 * Storage: MEMORY ONLY — no disk writes at any point.
 * File size limit: 5 MB (triggers LIMIT_FILE_SIZE error → 413).
 * File filter: rejects MIME types outside the allowlist (→ 415).
 *
 * Note: multer ships CJS but interops cleanly with the worker's ESM/tsx runner.
 * If this ever breaks under tsx, the fallback is busboy (see design §14).
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      const err = new Error(`Unsupported MIME type: ${file.mimetype}`);
      (err as NodeJS.ErrnoException & { code: string }).code = UploadErrorCode.INVALID_MIME;
      cb(err as unknown as null, false);
    } else {
      cb(null, true);
    }
  },
});

// ── Exported middleware ───────────────────────────────────────────────────────

/**
 * Single-file upload middleware for the `file` field.
 *
 * After this middleware runs:
 *   - req.file is populated (buffer in memory — no path, no disk write).
 *   - Multer LIMIT_FILE_SIZE error surfaces as an error passed to next().
 *   - INVALID_MIME rejection surfaces as an error passed to next().
 *
 * Magic-byte verification is handled in the controller (after this middleware),
 * because it requires access to req.file.buffer.
 */
export const uploadSingleFile: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const mapped = translateUploadError(err);
      if (mapped) {
        res.status(mapped.status).json({ error: mapped.message });
        return;
      }
      // Unknown multer error — pass to Express error handler
      next(err);
      return;
    }
    next();
  });
};
