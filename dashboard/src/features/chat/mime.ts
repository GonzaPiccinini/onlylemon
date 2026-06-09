/**
 * mime.ts — Mimetype helpers shared across chat components.
 */

/**
 * WhatsApp stickers always arrive as image/webp (regular photos are
 * re-encoded to JPEG by WhatsApp), so webp ≈ sticker in practice.
 */
export function isStickerMime(mime: string | null): boolean {
  return mime === 'image/webp';
}
