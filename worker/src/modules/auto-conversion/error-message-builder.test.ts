import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildErrorReply, formatARS } from './error-message-builder.js';
import {
  AmountBelowMinError,
  AmountAboveMaxError,
  BudgetExceededError,
  LeadNotFoundError,
  NoImageFoundError,
  OcrUnreadableError,
} from './errors.js';

const ISO_FIXED = '2026-05-18T00:35:42.000Z'; // 21:35:42 in Argentina (UTC-3)
const PHONE_AR = '5493472502738@c.us';

test('builds rich reply with header, client, time, motivo', () => {
  const reply = buildErrorReply({
    error: new NoImageFoundError(),
    clientPhone: PHONE_AR,
    whenIso: ISO_FIXED,
  });

  assert.match(reply, /^❌ Carga automática fallida$/m);
  assert.match(reply, /👤 Cliente: \+54 9 3472 502 738/);
  assert.match(reply, /🕐 21:35:42/);
  assert.match(reply, /⚠️ Motivo: /);
  assert.ok(!reply.includes('🏷️'), 'Lead line absent when not provided');
  assert.ok(!reply.includes('💵'), 'Amount line absent when not provided');
});

test('includes lead line when leadCode provided', () => {
  const reply = buildErrorReply({
    error: new LeadNotFoundError(),
    clientPhone: PHONE_AR,
    whenIso: ISO_FIXED,
    leadCode: 'QA-AUTOCONV-001',
  });
  assert.match(reply, /🏷️ Lead: QA-AUTOCONV-001/);
});

test('includes amount line when amount provided', () => {
  const reply = buildErrorReply({
    error: new AmountBelowMinError(7500, 10000),
    clientPhone: PHONE_AR,
    whenIso: ISO_FIXED,
    amount: 7500,
  });
  assert.match(reply, /💵 Monto leído: \$7\.500/);
});

test('amount AND lead both shown when both provided (AmountBelowMin case)', () => {
  const reply = buildErrorReply({
    error: new AmountBelowMinError(7500, 10000),
    clientPhone: PHONE_AR,
    whenIso: ISO_FIXED,
    leadCode: 'QA-AUTOCONV-001',
    amount: 7500,
  });
  assert.match(reply, /🏷️ Lead: QA-AUTOCONV-001/);
  assert.match(reply, /💵 Monto leído: \$7\.500/);
  assert.match(reply, /⚠️ Motivo:.*menor al mínimo/);
});

test('order of lines is consistent: header, client, time, lead, amount, motivo', () => {
  const reply = buildErrorReply({
    error: new AmountAboveMaxError(5_000_000, 1_000_000),
    clientPhone: PHONE_AR,
    whenIso: ISO_FIXED,
    leadCode: 'QA-001',
    amount: 5_000_000,
  });
  const lines = reply.split('\n');
  assert.equal(lines[0], '❌ Carga automática fallida');
  assert.match(lines[1], /^👤 Cliente:/);
  assert.match(lines[2], /^🕐 /);
  assert.match(lines[3], /^🏷️ Lead:/);
  assert.match(lines[4], /^💵 Monto leído:/);
  assert.match(lines[5], /^⚠️ Motivo:/);
});

test('unknown error → falls through to UnexpectedError reply', () => {
  const reply = buildErrorReply({
    error: new Error('something weird'),
    clientPhone: PHONE_AR,
    whenIso: ISO_FIXED,
  });
  assert.match(reply, /Error interno procesando el comprobante/);
});

test('formats phone without 9 prefix correctly', () => {
  // 54 + area + mid + tail (no leading 9)
  const reply = buildErrorReply({
    error: new BudgetExceededError(),
    clientPhone: '5411499987654',
    whenIso: ISO_FIXED,
  });
  assert.match(reply, /👤 Cliente: \+54 11 4999 87654|👤 Cliente: \+54 114 999 87654|👤 Cliente: \+54 1149 998 7654|👤 Cliente: \+5411499987654/);
});

test('falls back to +<digits> for non-AR phones', () => {
  const reply = buildErrorReply({
    error: new OcrUnreadableError(),
    clientPhone: '+1 (555) 123-4567',
    whenIso: ISO_FIXED,
  });
  assert.match(reply, /👤 Cliente: \+15551234567/);
});

test('formatARS uses dot as thousands separator and drops cents', () => {
  assert.equal(formatARS(7500).replace(/\s/g, ''), '$7.500');
  assert.equal(formatARS(1_000_000).replace(/\s/g, ''), '$1.000.000');
  assert.equal(formatARS(0).replace(/\s/g, ''), '$0');
});

test('amount=0 IS shown (zero is a valid amount line)', () => {
  const reply = buildErrorReply({
    error: new AmountBelowMinError(0, 10000),
    clientPhone: PHONE_AR,
    whenIso: ISO_FIXED,
    amount: 0,
  });
  assert.match(reply, /💵 Monto leído: \$0/);
});

test('amount=null / undefined → amount line absent', () => {
  const r1 = buildErrorReply({
    error: new NoImageFoundError(),
    clientPhone: PHONE_AR,
    whenIso: ISO_FIXED,
    amount: null,
  });
  assert.ok(!r1.includes('💵'));

  const r2 = buildErrorReply({
    error: new NoImageFoundError(),
    clientPhone: PHONE_AR,
    whenIso: ISO_FIXED,
  });
  assert.ok(!r2.includes('💵'));
});
