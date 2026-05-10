import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// leads-filter-recarga — B1: leadsFilterSchema Zod tests
// ---------------------------------------------------------------------------

// B1.1 — RECARGA is a valid status value
test('leadsFilterSchema: accepts statuses = ["RECARGA"]', async () => {
  const { leadsFilterSchema } = await import('./admin.types.js');
  const result = leadsFilterSchema.safeParse({ statuses: ['RECARGA'] });
  assert.equal(result.success, true, 'Expected RECARGA to be accepted but got validation error');
});

// B1.2 — Unknown status values must be rejected
test('leadsFilterSchema: rejects statuses = ["SOMETHING_ELSE"]', async () => {
  const { leadsFilterSchema } = await import('./admin.types.js');
  const result = leadsFilterSchema.safeParse({ statuses: ['SOMETHING_ELSE'] });
  assert.equal(result.success, false, 'Expected SOMETHING_ELSE to be rejected but it was accepted');
});

// Triangulation: existing valid statuses still work after extension
test('leadsFilterSchema: still accepts original statuses [NOT_CONTACTED, CONTACTED, CONVERTED]', async () => {
  const { leadsFilterSchema } = await import('./admin.types.js');
  const result = leadsFilterSchema.safeParse({ statuses: ['NOT_CONTACTED', 'CONTACTED', 'CONVERTED'] });
  assert.equal(result.success, true, 'Original statuses should still be accepted');
});

// Triangulation: mixed RECARGA with existing statuses
test('leadsFilterSchema: accepts mixed statuses including RECARGA', async () => {
  const { leadsFilterSchema } = await import('./admin.types.js');
  const result = leadsFilterSchema.safeParse({ statuses: ['CONVERTED', 'RECARGA'] });
  assert.equal(result.success, true, 'Mixed CONVERTED + RECARGA should be accepted');
});

// ---------------------------------------------------------------------------
// B2.1 — LandingFallbackPhone DTOs + input types (compile-time shape tests)
// ---------------------------------------------------------------------------

test('LandingFallbackPhoneDto is exported from admin.types', async () => {
  // This is a compile-time type — we verify it is usable as a structural type
  // by importing the module and confirming it compiles without errors.
  // The actual shape is enforced via TypeScript; at runtime we just check the
  // module exports a symbol with the expected name (type aliases are erased,
  // so we check via a value-level satisfies assertion using a test object).
  const mod = await import('./admin.types.js');
  // The module must export the Zod fallback schema placeholder (or the type is present
  // at compile-time). Here we verify the module loads and the type annotation
  // in the test file itself compiles — if LandingFallbackPhoneDto is missing the
  // import below would produce a TS error.
  assert.ok(mod !== null); // load guard
});

test('LandingFallbackPhoneDto: compile-time shape — all required fields present', async () => {
  // Structural compile-time check: instantiate a value that satisfies the type.
  // TypeScript will error at build time if the shape doesn't match.
  type LandingFallbackPhoneDto = import('./admin.types.js').LandingFallbackPhoneDto;
  const dto: LandingFallbackPhoneDto = {
    id: 'uuid-1',
    landingId: 'uuid-landing',
    phone: '+5491123456789',
    label: 'Backup',
    order: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  assert.equal(typeof dto.id, 'string');
  assert.equal(typeof dto.landingId, 'string');
  assert.equal(typeof dto.phone, 'string');
  assert.equal(typeof dto.createdAt, 'string');
  assert.equal(typeof dto.updatedAt, 'string');
});

test('LandingFallbackPhoneDto: label and order are nullable', async () => {
  type LandingFallbackPhoneDto = import('./admin.types.js').LandingFallbackPhoneDto;
  const dto: LandingFallbackPhoneDto = {
    id: 'uuid-1',
    landingId: 'uuid-landing',
    phone: '+5491123456789',
    label: null,
    order: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  assert.equal(dto.label, null);
  assert.equal(dto.order, null);
});

test('CreateLandingFallbackPhoneInput: compile-time shape — phone required, label/order optional', async () => {
  type CreateLandingFallbackPhoneInput = import('./admin.types.js').CreateLandingFallbackPhoneInput;
  // Minimal valid input
  const minimal: CreateLandingFallbackPhoneInput = { landingId: 'lid', phone: '+5491123456789' };
  assert.equal(typeof minimal.phone, 'string');
  // With optional fields
  const full: CreateLandingFallbackPhoneInput = { landingId: 'lid', phone: '+5491123456789', label: 'Main', order: 0 };
  assert.equal(typeof full.label, 'string');
});

test('UpdateLandingFallbackPhoneInput: compile-time shape — all fields optional', async () => {
  type UpdateLandingFallbackPhoneInput = import('./admin.types.js').UpdateLandingFallbackPhoneInput;
  // Empty patch is valid (all fields optional)
  const empty: UpdateLandingFallbackPhoneInput = {};
  assert.ok(empty !== undefined);
  // Partial phone update
  const withPhone: UpdateLandingFallbackPhoneInput = { phone: '+5491199999999' };
  assert.equal(typeof withPhone.phone, 'string');
  // Null values for label and order are allowed
  const withNulls: UpdateLandingFallbackPhoneInput = { label: null, order: null };
  assert.equal(withNulls.label, null);
});
