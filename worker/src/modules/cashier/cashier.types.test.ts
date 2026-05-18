import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConversionSchema, cashierConversionsFilterSchema } from './cashier.types.js';

test('createConversionSchema rejects zero', () => {
  const parsed = createConversionSchema.safeParse({ amount: 0 });
  assert.equal(parsed.success, false);
});

test('createConversionSchema rejects negative amounts', () => {
  const parsed = createConversionSchema.safeParse({ amount: -100 });
  assert.equal(parsed.success, false);
});

test('createConversionSchema rejects non-integer amounts', () => {
  const parsed = createConversionSchema.safeParse({ amount: 100.5 });
  assert.equal(parsed.success, false);
});

test('createConversionSchema accepts positive integer amount', () => {
  const parsed = createConversionSchema.safeParse({ amount: 7500 });
  assert.equal(parsed.success, true);
});

test('createConversionSchema accepts low positive amounts (range enforced at controller layer)', () => {
  const parsed = createConversionSchema.safeParse({ amount: 100 });
  assert.equal(parsed.success, true);
});

// ---------------------------------------------------------------------------
// M1.1 — cashierConversionsFilterSchema tests (RED)
// ---------------------------------------------------------------------------

test('cashierConversionsFilterSchema: valid full params accepted', () => {
  const parsed = cashierConversionsFilterSchema.safeParse({
    dateFrom: '2026-05-01',
    dateTo: '2026-05-07',
    phone: '+5491111111',
    code: 'ABC-001',
    amountMin: '5000',
    amountMax: '10000',
    page: '2',
    pageSize: '50',
  });
  assert.equal(parsed.success, true);
});

test('cashierConversionsFilterSchema: page defaults to 1 when absent', () => {
  const parsed = cashierConversionsFilterSchema.safeParse({});
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.page, 1);
  }
});

test('cashierConversionsFilterSchema: pageSize defaults to 25 when absent', () => {
  const parsed = cashierConversionsFilterSchema.safeParse({});
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.pageSize, 25);
  }
});

test('cashierConversionsFilterSchema: amountMin string coerces to number', () => {
  const parsed = cashierConversionsFilterSchema.safeParse({ amountMin: '500' });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.amountMin, 500);
  }
});

test('cashierConversionsFilterSchema: dateFrom invalid format fails', () => {
  const parsed = cashierConversionsFilterSchema.safeParse({ dateFrom: '2026-5-6' });
  assert.equal(parsed.success, false);
});

test('cashierConversionsFilterSchema: cashierId absent from parsed.data', () => {
  const parsed = cashierConversionsFilterSchema.safeParse({ cashierId: 'spoof' });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    const data = parsed.data as Record<string, unknown>;
    assert.equal(data['cashierId'], undefined);
  }
});

test('cashierConversionsFilterSchema: cashierIds absent from parsed.data', () => {
  const parsed = cashierConversionsFilterSchema.safeParse({ cashierIds: ['spoof'] });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    const data = parsed.data as Record<string, unknown>;
    assert.equal(data['cashierIds'], undefined);
  }
});

// ---------------------------------------------------------------------------
// M1.3 — REFACTOR: edge-case assertions (no production code changes)
// ---------------------------------------------------------------------------

test('cashierConversionsFilterSchema: cashierId absent from parsed.data (defense-in-depth)', () => {
  const parsed = cashierConversionsFilterSchema.safeParse({ cashierId: 'x', amountMin: '100' });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    const data = parsed.data as Record<string, unknown>;
    assert.equal(data['cashierId'], undefined);
  }
});

test('cashierConversionsFilterSchema: amountMin "500" string coerces to number 500', () => {
  const parsed = cashierConversionsFilterSchema.safeParse({ amountMin: '500' });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.strictEqual(parsed.data.amountMin, 500);
    assert.equal(typeof parsed.data.amountMin, 'number');
  }
});

test('cashierConversionsFilterSchema: dateFrom "2026-5-6" (no zero-padding) fails regex', () => {
  const parsed = cashierConversionsFilterSchema.safeParse({ dateFrom: '2026-5-6' });
  assert.equal(parsed.success, false);
});
