import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  argentinaDayStartUtc,
  argentinaDayEndUtcExclusive,
  formatArgentinaDayKey,
} from './timezone.js';

test('argentinaDayStartUtc returns 03:00 UTC for the given Argentina day', () => {
  assert.equal(
    argentinaDayStartUtc('2026-05-05').toISOString(),
    '2026-05-05T03:00:00.000Z',
  );
});

test('argentinaDayEndUtcExclusive returns the next-day 03:00 UTC boundary', () => {
  assert.equal(
    argentinaDayEndUtcExclusive('2026-05-05').toISOString(),
    '2026-05-06T03:00:00.000Z',
  );
});

test('formatArgentinaDayKey buckets a UTC timestamp 1 minute before Argentina midnight into the previous day', () => {
  // 2026-05-05T02:59:00.000Z = 23:59 May 4 Argentina
  assert.equal(
    formatArgentinaDayKey(new Date('2026-05-05T02:59:00.000Z')),
    '2026-05-04',
  );
});

test('formatArgentinaDayKey buckets exactly 03:00 UTC into the new Argentina day', () => {
  // 2026-05-05T03:00:00.000Z = 00:00 May 5 Argentina
  assert.equal(
    formatArgentinaDayKey(new Date('2026-05-05T03:00:00.000Z')),
    '2026-05-05',
  );
});

test('formatArgentinaDayKey buckets mid-day UTC correctly into the same Argentina day', () => {
  // 2026-05-05T15:30:00.000Z = 12:30 May 5 Argentina
  assert.equal(
    formatArgentinaDayKey(new Date('2026-05-05T15:30:00.000Z')),
    '2026-05-05',
  );
});

test('formatArgentinaDayKey buckets 30 minutes before Argentina midnight into the same Argentina day', () => {
  // 2026-05-06T02:30:00.000Z = 23:30 May 5 Argentina (spec Scenario 8)
  assert.equal(
    formatArgentinaDayKey(new Date('2026-05-06T02:30:00.000Z')),
    '2026-05-05',
  );
});

test('argentinaDayStartUtc and formatArgentinaDayKey round-trip the same key', () => {
  assert.equal(
    formatArgentinaDayKey(argentinaDayStartUtc('2026-05-05')),
    '2026-05-05',
  );
});
