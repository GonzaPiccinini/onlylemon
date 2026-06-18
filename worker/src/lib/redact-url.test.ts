import { test } from 'node:test';
import assert from 'node:assert/strict';

import { redactUrlSecrets } from './redact-url.js';

test('returns the URL unchanged when there is no query string', () => {
  assert.equal(
    redactUrlSecrets('/api/chat/sessions/abc/chats'),
    '/api/chat/sessions/abc/chats',
  );
});

test('redacts the token query param value (SSE JWT leak)', () => {
  const out = redactUrlSecrets('/chat/stream?token=header.payload.signature');
  assert.equal(out, '/chat/stream?token=REDACTED');
  assert.ok(!out.includes('header.payload.signature'));
});

test('redacts token on the runtime-state SSE endpoint', () => {
  const out = redactUrlSecrets('/cashier/runtime-state/stream?token=aaa.bbb.ccc');
  assert.ok(!out.includes('aaa.bbb.ccc'));
  assert.match(out, /token=REDACTED/);
});

test('redacts only the sensitive param, preserving the others', () => {
  const out = redactUrlSecrets('/x?a=1&token=supersecret&b=2');
  assert.equal(out, '/x?a=1&token=REDACTED&b=2');
});

test('is case-insensitive on the param name', () => {
  const out = redactUrlSecrets('/x?Token=secret');
  assert.equal(out, '/x?Token=REDACTED');
});

test('redacts multiple sensitive params (token + password)', () => {
  const out = redactUrlSecrets('/x?token=aaa&password=bbb');
  assert.ok(!out.includes('aaa'));
  assert.ok(!out.includes('bbb'));
});

test('does not redact a non-sensitive param whose value merely contains "token"', () => {
  const out = redactUrlSecrets('/x?q=mytokenvalue');
  assert.equal(out, '/x?q=mytokenvalue');
});

test('does not over-match a param name that merely ends in a sensitive word', () => {
  // csrf_token is not an exact key in the allowlist → left untouched.
  const out = redactUrlSecrets('/x?csrf_token=abc');
  assert.equal(out, '/x?csrf_token=abc');
});
