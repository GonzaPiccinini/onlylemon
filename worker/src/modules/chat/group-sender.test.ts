import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractGroupSenderName } from './group-sender.js';

// Shapes below mirror REAL WAHA GOWS 2026.3.4 group messages captured from the
// live API (GET /api/{session}/chats/{group}/messages).

test('returns the GOWS PushName for an incoming group message', () => {
  const msg = {
    from: '120363427669598042@g.us',
    fromMe: false,
    participant: '47408553701472@lid',
    _data: {
      Info: {
        PushName: 'Soporte',
        SenderAlt: '5493516835986:26@s.whatsapp.net',
        IsGroup: true,
      },
    },
  };
  assert.equal(extractGroupSenderName(msg), 'Soporte');
});

test('falls back to +phone from SenderAlt when PushName is missing', () => {
  const msg = {
    from: '120363427669598042@g.us',
    fromMe: false,
    _data: { Info: { SenderAlt: '5493516835986:26@s.whatsapp.net', IsGroup: true } },
  };
  assert.equal(extractGroupSenderName(msg), '+5493516835986');
});

test('returns null for an outbound group message (fromMe)', () => {
  const msg = {
    from: '120363427669598042@g.us',
    fromMe: true,
    _data: { Info: { PushName: 'Yo', IsGroup: true } },
  };
  assert.equal(extractGroupSenderName(msg), null);
});

test('returns null for a non-group (1:1) chat', () => {
  const msg = {
    from: '5491112345678@c.us',
    fromMe: false,
    _data: { Info: { PushName: 'Alice', IsGroup: false } },
  };
  assert.equal(extractGroupSenderName(msg), null);
});

test('detects a group via the @g.us suffix even without _data.Info.IsGroup', () => {
  const msg = {
    from: '120363427669598042@g.us',
    fromMe: false,
    _data: { Info: { PushName: 'Soporte' } },
  };
  assert.equal(extractGroupSenderName(msg), 'Soporte');
});

test('returns null when group sender cannot be resolved (no PushName, no usable SenderAlt)', () => {
  const msg = {
    from: '120363427669598042@g.us',
    fromMe: false,
    participant: '47408553701472@lid',
    _data: { Info: { IsGroup: true, SenderAlt: '' } },
  };
  assert.equal(extractGroupSenderName(msg), null);
});

test('handles missing/empty input safely', () => {
  assert.equal(extractGroupSenderName(undefined), null);
  assert.equal(extractGroupSenderName(null), null);
  assert.equal(extractGroupSenderName({}), null);
});
