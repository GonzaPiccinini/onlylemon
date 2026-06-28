import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hashPassword, verifyPassword } from './password.js';

const legacySha256 = (password: string): string =>
  createHash('sha256').update(password).digest('hex');

test('hashPassword produces an Argon2id digest, not the plaintext', async () => {
  const digest = await hashPassword('correct horse battery staple');
  assert.equal(typeof digest, 'string');
  assert.ok(digest.startsWith('$argon2id$'), 'digest must be an Argon2id hash');
  assert.notEqual(digest, 'correct horse battery staple');
});

test('hashPassword is salted: the same password yields different digests', async () => {
  const [a, b] = await Promise.all([hashPassword('same-pw'), hashPassword('same-pw')]);
  assert.notEqual(a, b, 'a per-hash random salt must make digests differ');
});

test('verifyPassword: correct password against an Argon2id hash → valid, no rehash', async () => {
  const digest = await hashPassword('s3cret-pw');
  assert.deepEqual(await verifyPassword('s3cret-pw', digest), {
    valid: true,
    needsRehash: false,
  });
});

test('verifyPassword: wrong password against an Argon2id hash → invalid', async () => {
  const digest = await hashPassword('s3cret-pw');
  assert.deepEqual(await verifyPassword('wrong-pw', digest), {
    valid: false,
    needsRehash: false,
  });
});

test('verifyPassword: malformed Argon2-prefixed hash → invalid, does not throw', async () => {
  assert.deepEqual(await verifyPassword('whatever', '$argon2id$broken-garbage'), {
    valid: false,
    needsRehash: false,
  });
});

test('verifyPassword: correct password against a legacy SHA-256 hash → valid + needsRehash', async () => {
  const legacy = legacySha256('legacy-pw');
  assert.deepEqual(await verifyPassword('legacy-pw', legacy), {
    valid: true,
    needsRehash: true,
  });
});

test('verifyPassword: wrong password against a legacy SHA-256 hash → invalid, no rehash', async () => {
  const legacy = legacySha256('legacy-pw');
  assert.deepEqual(await verifyPassword('nope', legacy), {
    valid: false,
    needsRehash: false,
  });
});
