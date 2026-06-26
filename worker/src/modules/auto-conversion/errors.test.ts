/**
 * auto-conversion/errors.test.ts
 *
 * Tests for all AutoConversionError subclasses and the toSpanishReply mapper.
 *
 * TDD cycle: written BEFORE errors.ts exists (RED), then green once implemented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Minimal env stubs required by config/env.ts import chain
// ---------------------------------------------------------------------------
process.env.PORT = process.env.PORT ?? '3002';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.BULLMQ_REDIS_URL = process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379';
process.env.BULLMQ_QUEUE_NAME = process.env.BULLMQ_QUEUE_NAME ?? 'test-queue';
process.env.WORKER_CONCURRENCY = process.env.WORKER_CONCURRENCY ?? '1';
process.env.WAHA_API_KEY = process.env.WAHA_API_KEY ?? 'waha-key';
process.env.WAHA_BASE_URL = process.env.WAHA_BASE_URL ?? 'http://localhost:3000';
process.env.WAHA_WEBHOOK_URL = process.env.WAHA_WEBHOOK_URL ?? 'http://localhost:3002/webhook';
process.env.WAHA_WEBHOOK_EVENTS = process.env.WAHA_WEBHOOK_EVENTS ?? 'message.any,session.status';
process.env.WAHA_WEBHOOK_TOKEN_HEADER = process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
process.env.WAHA_WEBHOOK_TOKEN_VALUE = process.env.WAHA_WEBHOOK_TOKEN_VALUE ?? 'token';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? '1234567890123456';
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? 'turnstile-secret';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';
process.env.LEADS_CODE_TTL_HOURS = process.env.LEADS_CODE_TTL_HOURS ?? '24';

// ---------------------------------------------------------------------------
// Import the module under test
// ---------------------------------------------------------------------------

import {
  AutoConversionError,
  NoImageFoundError,
  UnsupportedMediaError,
  MediaDownloadError,
  OcrUnreadableError,
  OcrInvalidAmountError,
  LeadNotFoundError,
  LeadInvalidStatusError,
  BudgetExceededError,
  UnexpectedError,
  toSpanishReply,
} from './errors.js';

import { OpenAiUnavailableError } from '../../integrations/openai/client.js';

// ---------------------------------------------------------------------------
// Base class contract
// ---------------------------------------------------------------------------

test('AutoConversionError: is an instance of Error', () => {
  const err = new NoImageFoundError();
  assert.ok(err instanceof Error);
  assert.ok(err instanceof AutoConversionError);
});

test('AutoConversionError: has a stable code property', () => {
  const err = new NoImageFoundError();
  assert.equal(typeof err.code, 'string');
  assert.ok(err.code.length > 0);
});

// ---------------------------------------------------------------------------
// NoImageFoundError
// ---------------------------------------------------------------------------

test('NoImageFoundError: extends AutoConversionError', () => {
  const err = new NoImageFoundError();
  assert.ok(err instanceof AutoConversionError);
});

test('NoImageFoundError: has code NO_IMAGE_FOUND', () => {
  const err = new NoImageFoundError();
  assert.equal(err.code, 'NO_IMAGE_FOUND');
});

test('toSpanishReply: NoImageFoundError → correct Spanish string', () => {
  const reply = toSpanishReply(new NoImageFoundError());
  assert.equal(reply, 'No encontre ninguna imagen del comprobante en los ultimos mensajes.');
});

// ---------------------------------------------------------------------------
// UnsupportedMediaError
// ---------------------------------------------------------------------------

test('UnsupportedMediaError: extends AutoConversionError', () => {
  const err = new UnsupportedMediaError();
  assert.ok(err instanceof AutoConversionError);
});

test('UnsupportedMediaError: has code UNSUPPORTED_MEDIA', () => {
  const err = new UnsupportedMediaError();
  assert.equal(err.code, 'UNSUPPORTED_MEDIA');
});

test('toSpanishReply: UnsupportedMediaError → correct Spanish string', () => {
  const reply = toSpanishReply(new UnsupportedMediaError());
  assert.equal(reply, 'Formato no soportado: enviame el comprobante como imagen (JPG/PNG) o PDF.');
});

// ---------------------------------------------------------------------------
// MediaDownloadError
// ---------------------------------------------------------------------------

test('MediaDownloadError: extends AutoConversionError', () => {
  const err = new MediaDownloadError();
  assert.ok(err instanceof AutoConversionError);
});

test('MediaDownloadError: has code MEDIA_DOWNLOAD_ERROR', () => {
  const err = new MediaDownloadError();
  assert.equal(err.code, 'MEDIA_DOWNLOAD_ERROR');
});

test('toSpanishReply: MediaDownloadError → correct Spanish string', () => {
  const reply = toSpanishReply(new MediaDownloadError());
  assert.equal(reply, 'No pude descargar el comprobante. Reintenta enviarlo.');
});

// ---------------------------------------------------------------------------
// OcrUnreadableError
// ---------------------------------------------------------------------------

test('OcrUnreadableError: extends AutoConversionError', () => {
  const err = new OcrUnreadableError();
  assert.ok(err instanceof AutoConversionError);
});

test('OcrUnreadableError: has code OCR_UNREADABLE', () => {
  const err = new OcrUnreadableError();
  assert.equal(err.code, 'OCR_UNREADABLE');
});

test('toSpanishReply: OcrUnreadableError → correct Spanish string', () => {
  const reply = toSpanishReply(new OcrUnreadableError());
  assert.equal(reply, 'No pude leer el monto del comprobante. Reenvialo mas claro.');
});

// ---------------------------------------------------------------------------
// OcrInvalidAmountError
// ---------------------------------------------------------------------------

test('OcrInvalidAmountError: extends AutoConversionError', () => {
  const err = new OcrInvalidAmountError();
  assert.ok(err instanceof AutoConversionError);
});

test('OcrInvalidAmountError: has code OCR_INVALID_AMOUNT', () => {
  const err = new OcrInvalidAmountError();
  assert.equal(err.code, 'OCR_INVALID_AMOUNT');
});

test('toSpanishReply: OcrInvalidAmountError → correct Spanish string', () => {
  const reply = toSpanishReply(new OcrInvalidAmountError());
  assert.equal(reply, 'El monto leido no es valido. Verificalo y reintenta.');
});

// ---------------------------------------------------------------------------
// LeadNotFoundError
// ---------------------------------------------------------------------------

test('LeadNotFoundError: extends AutoConversionError', () => {
  const err = new LeadNotFoundError();
  assert.ok(err instanceof AutoConversionError);
});

test('LeadNotFoundError: has code LEAD_NOT_FOUND', () => {
  const err = new LeadNotFoundError();
  assert.equal(err.code, 'LEAD_NOT_FOUND');
});

test('toSpanishReply: LeadNotFoundError → correct Spanish string', () => {
  const reply = toSpanishReply(new LeadNotFoundError());
  assert.equal(reply, 'No encontre un lead reciente con ese telefono asignado a vos.');
});

// ---------------------------------------------------------------------------
// LeadInvalidStatusError
// ---------------------------------------------------------------------------

test('LeadInvalidStatusError: extends AutoConversionError', () => {
  const err = new LeadInvalidStatusError();
  assert.ok(err instanceof AutoConversionError);
});

test('LeadInvalidStatusError: has code LEAD_INVALID_STATUS', () => {
  const err = new LeadInvalidStatusError();
  assert.equal(err.code, 'LEAD_INVALID_STATUS');
});

test('toSpanishReply: LeadInvalidStatusError → correct Spanish string', () => {
  const reply = toSpanishReply(new LeadInvalidStatusError());
  assert.equal(reply, 'El lead no esta en un estado valido para registrar una conversion.');
});

// ---------------------------------------------------------------------------
// BudgetExceededError
// ---------------------------------------------------------------------------

test('BudgetExceededError: extends AutoConversionError', () => {
  const err = new BudgetExceededError();
  assert.ok(err instanceof AutoConversionError);
});

test('BudgetExceededError: has code BUDGET_EXCEEDED', () => {
  const err = new BudgetExceededError();
  assert.equal(err.code, 'BUDGET_EXCEEDED');
});

test('toSpanishReply: BudgetExceededError → correct Spanish string', () => {
  const reply = toSpanishReply(new BudgetExceededError());
  assert.equal(reply, 'Limite diario de OCR alcanzado. Intenta manualmente.');
});

// ---------------------------------------------------------------------------
// OpenAiUnavailableError (imported from integrations/openai/client.ts)
// ---------------------------------------------------------------------------

test('OpenAiUnavailableError: is an instance of Error', () => {
  const err = new OpenAiUnavailableError();
  assert.ok(err instanceof Error);
});

test('toSpanishReply: OpenAiUnavailableError → correct Spanish string', () => {
  const reply = toSpanishReply(new OpenAiUnavailableError());
  assert.equal(reply, 'Servicio de OCR temporalmente caido. Reintenta en unos minutos.');
});

// ---------------------------------------------------------------------------
// UnexpectedError
// ---------------------------------------------------------------------------

test('UnexpectedError: extends AutoConversionError', () => {
  const err = new UnexpectedError();
  assert.ok(err instanceof AutoConversionError);
});

test('UnexpectedError: has code UNEXPECTED_ERROR', () => {
  const err = new UnexpectedError();
  assert.equal(err.code, 'UNEXPECTED_ERROR');
});

test('toSpanishReply: UnexpectedError → correct Spanish string', () => {
  const reply = toSpanishReply(new UnexpectedError());
  assert.equal(reply, 'Error interno procesando el comprobante. Avisa al admin.');
});

// ---------------------------------------------------------------------------
// toSpanishReply — unknown error fallback
// ---------------------------------------------------------------------------

test('toSpanishReply: unknown Error → UnexpectedError reply (fallback)', () => {
  const reply = toSpanishReply(new Error('some random error'));
  assert.equal(reply, 'Error interno procesando el comprobante. Avisa al admin.');
});

test('toSpanishReply: non-Error value → UnexpectedError reply (fallback)', () => {
  const reply = toSpanishReply('string error');
  assert.equal(reply, 'Error interno procesando el comprobante. Avisa al admin.');
});

test('toSpanishReply: null → UnexpectedError reply (fallback)', () => {
  const reply = toSpanishReply(null);
  assert.equal(reply, 'Error interno procesando el comprobante. Avisa al admin.');
});

// ---------------------------------------------------------------------------
// Item #6 — AmountBelowMinError
// ---------------------------------------------------------------------------

import {
  AmountBelowMinError,
  AmountAboveMaxError,
} from './errors.js';

test('AmountBelowMinError: extends AutoConversionError', () => {
  const err = new AmountBelowMinError(5000, 10000);
  assert.ok(err instanceof AutoConversionError);
});

test('AmountBelowMinError: has code AMOUNT_BELOW_MIN', () => {
  const err = new AmountBelowMinError(5000, 10000);
  assert.equal(err.code, 'AMOUNT_BELOW_MIN');
});

test('AmountBelowMinError: exposes amount and min properties', () => {
  const err = new AmountBelowMinError(5000, 10000);
  assert.equal(err.amount, 5000);
  assert.equal(err.min, 10000);
});

test('toSpanishReply: AmountBelowMinError → includes monto and mínimo in ARS format', () => {
  const reply = toSpanishReply(new AmountBelowMinError(5000, 10000));
  // Must mention $5.000 and $10.000 (ARS thousands with dot)
  assert.ok(reply.includes('5.000'), `Expected ARS 5000 formatted, got: ${reply}`);
  assert.ok(reply.includes('10.000'), `Expected ARS 10000 formatted, got: ${reply}`);
  assert.ok(reply.toLowerCase().includes('menor'), `Expected 'menor' in reply, got: ${reply}`);
});

// ---------------------------------------------------------------------------
// Item #6 — AmountAboveMaxError
// ---------------------------------------------------------------------------

test('AmountAboveMaxError: extends AutoConversionError', () => {
  const err = new AmountAboveMaxError(5000000, 1000000);
  assert.ok(err instanceof AutoConversionError);
});

test('AmountAboveMaxError: has code AMOUNT_ABOVE_MAX', () => {
  const err = new AmountAboveMaxError(5000000, 1000000);
  assert.equal(err.code, 'AMOUNT_ABOVE_MAX');
});

test('AmountAboveMaxError: exposes amount and max properties', () => {
  const err = new AmountAboveMaxError(5000000, 1000000);
  assert.equal(err.amount, 5000000);
  assert.equal(err.max, 1000000);
});

test('toSpanishReply: AmountAboveMaxError → includes monto and máximo in ARS format', () => {
  const reply = toSpanishReply(new AmountAboveMaxError(5000000, 1000000));
  // Must mention $5.000.000 and $1.000.000 (ARS thousands with dot)
  assert.ok(reply.includes('1.000.000'), `Expected ARS 1000000 formatted, got: ${reply}`);
  assert.ok(reply.toLowerCase().includes('supera') || reply.toLowerCase().includes('máximo'), `Expected 'supera' or 'máximo' in reply, got: ${reply}`);
});
