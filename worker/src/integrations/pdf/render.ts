/**
 * integrations/pdf/render.ts
 *
 * PDF-to-PNG rendering utility using `pdf-to-png-converter` (wraps pdfjs-dist with
 * @napi-rs/canvas pre-built binaries — no Poppler/Cairo/Ghostscript required).
 *
 * Pre-built musl binaries exist for linux-x64-musl (Alpine) so the worker container
 * builds cleanly without extra apk packages.
 *
 * Note: On Windows dev machines, pdfjs-dist has a known path issue (backslash vs
 * forward-slash in cMapUrl/standardFontDataUrl). This does NOT affect Linux/Alpine
 * deployment. Tests use mocking or expect rejection on Windows.
 */

import { pdfToPng } from 'pdf-to-png-converter';

/**
 * Renders page 1 of a PDF buffer to a PNG buffer.
 *
 * @param buffer - Raw bytes of the PDF file.
 * @returns A Buffer containing the PNG image of page 1.
 * @throws Error if the buffer is empty, not a valid PDF, has 0 pages, or rendering fails.
 */
export async function renderPdfFirstPageToPng(buffer: Buffer): Promise<Buffer> {
  if (!buffer || buffer.length === 0) {
    throw new Error('PDF buffer is empty');
  }

  let pages;
  try {
    pages = await pdfToPng(new Uint8Array(buffer), {
      viewportScale: 2.0,
      pagesToProcess: [1],
      verbosityLevel: 0,
      returnPageContent: true,
    });
  } catch (err) {
    throw new Error(
      `Failed to parse PDF: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!pages || pages.length === 0) {
    throw new Error('PDF has no pages');
  }

  const page = pages[0];
  if (!page.content) {
    throw new Error('PDF page 1 rendered no content');
  }

  // Coerce to Buffer regardless of whether the lib returns Buffer or Uint8Array
  return Buffer.isBuffer(page.content) ? page.content : Buffer.from(page.content);
}
