/**
 * auto-conversion/errors.ts
 *
 * Typed error classes for the auto-conversion flow.
 * Each class extends AutoConversionError and carries a stable `code` property
 * for structured logging.
 *
 * OpenAiUnavailableError lives in integrations/openai/client.ts (single source
 * of truth). It is imported here only for the toSpanishReply switch.
 */

import { OpenAiUnavailableError } from '../../integrations/openai/client.js';

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

export abstract class AutoConversionError extends Error {
  abstract readonly code: string;

  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
    // Maintain proper prototype chain in environments that transpile classes
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Concrete error classes
// ---------------------------------------------------------------------------

export class NoImageFoundError extends AutoConversionError {
  readonly code = 'NO_IMAGE_FOUND' as const;

  constructor(message = 'No image found in recent messages') {
    super(message);
  }
}

export class UnsupportedMediaError extends AutoConversionError {
  readonly code = 'UNSUPPORTED_MEDIA' as const;

  constructor(message = 'Unsupported media type') {
    super(message);
  }
}

export class MediaDownloadError extends AutoConversionError {
  readonly code = 'MEDIA_DOWNLOAD_ERROR' as const;

  constructor(message = 'Failed to download media') {
    super(message);
  }
}

export class OcrUnreadableError extends AutoConversionError {
  readonly code = 'OCR_UNREADABLE' as const;

  constructor(message = 'OCR could not read the amount') {
    super(message);
  }
}

export class OcrInvalidAmountError extends AutoConversionError {
  readonly code = 'OCR_INVALID_AMOUNT' as const;

  constructor(message = 'OCR returned an invalid amount') {
    super(message);
  }
}

export class LeadNotFoundError extends AutoConversionError {
  readonly code = 'LEAD_NOT_FOUND' as const;

  constructor(message = 'No recent lead found for this phone and cashier') {
    super(message);
  }
}

export class LeadInvalidStatusError extends AutoConversionError {
  readonly code = 'LEAD_INVALID_STATUS' as const;

  constructor(message = 'Lead status is not valid for conversion') {
    super(message);
  }
}

export class BudgetExceededError extends AutoConversionError {
  readonly code = 'BUDGET_EXCEEDED' as const;

  constructor(message = 'Daily OCR budget exceeded') {
    super(message);
  }
}

export class UnexpectedError extends AutoConversionError {
  readonly code = 'UNEXPECTED_ERROR' as const;

  constructor(message = 'Unexpected error processing the receipt') {
    super(message);
  }
}

export class AmountBelowMinError extends AutoConversionError {
  readonly code = 'AMOUNT_BELOW_MIN' as const;

  constructor(
    public readonly amount: number,
    public readonly min: number,
  ) {
    super(`Amount ${amount} below minimum ${min}`);
    this.name = 'AmountBelowMinError';
  }
}

export class AmountAboveMaxError extends AutoConversionError {
  readonly code = 'AMOUNT_ABOVE_MAX' as const;

  constructor(
    public readonly amount: number,
    public readonly max: number,
  ) {
    super(`Amount ${amount} above maximum ${max}`);
    this.name = 'AmountAboveMaxError';
  }
}

// Re-export for convenience so callers can import everything from one place
export { OpenAiUnavailableError };

// ---------------------------------------------------------------------------
// ARS currency formatter (shared by toSpanishReply)
// ---------------------------------------------------------------------------

function formatARS(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Spanish reply mapper
// ---------------------------------------------------------------------------

const UNEXPECTED_REPLY = 'Error interno procesando el comprobante. Avisa al admin.';

/**
 * Maps a thrown error to the appropriate WhatsApp Spanish reply string.
 * Falls back to the UnexpectedError reply for any unrecognized error.
 */
export function toSpanishReply(err: unknown): string {
  if (err instanceof NoImageFoundError) {
    return 'No encontre ninguna imagen del comprobante en los ultimos mensajes.';
  }
  if (err instanceof UnsupportedMediaError) {
    return 'Formato no soportado: enviame el comprobante como imagen (JPG/PNG) o PDF.';
  }
  if (err instanceof MediaDownloadError) {
    return 'No pude descargar el comprobante. Reintenta enviarlo.';
  }
  if (err instanceof OcrUnreadableError) {
    return 'No pude leer el monto del comprobante. Reenvialo mas claro.';
  }
  if (err instanceof OcrInvalidAmountError) {
    return 'El monto leido no es valido. Verificalo y reintenta.';
  }
  if (err instanceof LeadNotFoundError) {
    return 'No encontre un lead reciente con ese telefono asignado a vos.';
  }
  if (err instanceof LeadInvalidStatusError) {
    return 'El lead no esta en un estado valido para registrar una conversion.';
  }
  if (err instanceof BudgetExceededError) {
    return 'Limite diario de OCR alcanzado. Intenta manualmente.';
  }
  if (err instanceof OpenAiUnavailableError) {
    return 'Servicio de OCR temporalmente caido. Reintenta en unos minutos.';
  }
  if (err instanceof AmountBelowMinError) {
    return `El monto leído (${formatARS(err.amount)}) es menor al mínimo permitido (${formatARS(err.min)}).`;
  }
  if (err instanceof AmountAboveMaxError) {
    return `El monto leído (${formatARS(err.amount)}) supera el máximo permitido (${formatARS(err.max)}).`;
  }
  if (err instanceof UnexpectedError) {
    return UNEXPECTED_REPLY;
  }
  // Catch-all — any unknown error (plain Error, string, etc.)
  return UNEXPECTED_REPLY;
}
