/**
 * waha-shape-smoke.ts
 *
 * One-shot exploration script to verify the shape of WAHA Plus API responses
 * needed for the whatsapp-chat-ui V1 implementation. Outputs a structured
 * Markdown report to stdout. Phone numbers and message bodies are redacted.
 *
 * Usage:
 *   WAHA_BASE_URL=http://localhost:3001 WAHA_API_KEY=dev-waha-key \
 *     npx tsx worker/scripts/waha-shape-smoke.ts
 *
 * Environment:
 *   WAHA_BASE_URL  — defaults to http://localhost:3001
 *   WAHA_API_KEY   — defaults to dev-waha-key
 *
 * Exit codes:
 *   0 — report complete (some probes may show errors — that is expected)
 *   2 — WAHA unreachable or no WORKING session found
 */

import process from 'node:process';

const BASE_URL = process.env.WAHA_BASE_URL ?? 'http://localhost:3001';
const API_KEY = process.env.WAHA_API_KEY ?? 'dev-waha-key';

// ── Redaction helpers ────────────────────────────────────────────────────────

/** Redact phone-number-like sequences: 6+ consecutive digits */
function redactPhones(text: string): string {
  return text.replace(/\d{6,}/g, '<REDACTED_DIGITS>');
}

/** Deep-clone an object and redact phone-number-like strings + message bodies. */
function redactObject(obj: unknown, depth = 0): unknown {
  if (depth > 10) return obj; // safety guard
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // Redact phone digits and truncate long strings (message bodies)
    const shortened = obj.length > 80 ? obj.slice(0, 80) + '...[truncated]' : obj;
    return redactPhones(shortened);
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1));
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Redact known sensitive fields by key name regardless of content
      if (['body', 'text', 'caption', 'pushname', 'name'].includes(key) && typeof value === 'string') {
        result[key] = '<REDACTED_TEXT>';
      } else {
        result[key] = redactObject(value, depth + 1);
      }
    }
    return result;
  }
  return obj;
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function wahaGet(path: string, params: Record<string, string> = {}): Promise<{ ok: boolean; status: number; body: unknown }> {
  const query = new URLSearchParams(params);
  const url = `${BASE_URL}${path}${Object.keys(params).length > 0 ? '?' + query.toString() : ''}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-Api-Key': API_KEY, 'Accept': 'application/json' },
    });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: String(err) };
  }
}

async function wahaPost(path: string, payload: unknown): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `${BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Api-Key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: String(err) };
  }
}

// ── Field inspector ──────────────────────────────────────────────────────────

/** Returns a summary of top-level field names and their inferred types from an array of objects. */
function inspectFields(entries: unknown[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const entry of entries) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
        if (!(key in fields)) {
          fields[key] = inferType(value);
        }
      }
    }
  }
  return fields;
}

function inferType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `array(${value.length > 0 ? inferType(value[0]) : 'empty'})`;
  if (typeof value === 'object') return `object{${Object.keys(value as object).join(', ')}}`;
  return typeof value;
}

// ── Report sections ──────────────────────────────────────────────────────────

const lines: string[] = [];

function section(title: string) {
  lines.push('');
  lines.push(`## ${title}`);
  lines.push('');
}

function subsection(title: string) {
  lines.push(`### ${title}`);
  lines.push('');
}

function code(lang: string, content: string) {
  lines.push('```' + lang);
  lines.push(content);
  lines.push('```');
  lines.push('');
}

function note(text: string) {
  lines.push(`> ${text}`);
  lines.push('');
}

function bullet(text: string) {
  lines.push(`- ${text}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

lines.push('# WAHA Shape Smoke Report');
lines.push('');
lines.push(`**Date**: ${new Date().toISOString()}`);
lines.push(`**Target**: ${BASE_URL}`);
lines.push('');
note('Phone numbers, message bodies, and personal names are redacted. Field NAMES and TYPES are kept intact.');

// ── Probe 1: GET /api/sessions ───────────────────────────────────────────────

section('Probe 1 — GET /api/sessions');

const sessionsResult = await wahaGet('/api/sessions');

if (sessionsResult.status === 0) {
  console.error(`ERROR: WAHA unreachable at ${BASE_URL}. Response: ${sessionsResult.body}`);
  console.error('Ensure WAHA is running and WAHA_BASE_URL is set correctly.');
  process.exit(2);
}

bullet(`HTTP status: ${sessionsResult.status}`);
lines.push('');

const sessions = Array.isArray(sessionsResult.body) ? sessionsResult.body : [];
const workingSession = sessions.find((s: unknown) => {
  if (s && typeof s === 'object' && 'status' in (s as object)) {
    return (s as Record<string, unknown>)['status'] === 'WORKING';
  }
  return false;
}) as Record<string, unknown> | undefined;

if (!workingSession) {
  console.error('ERROR: No session with status=WORKING found.');
  console.error(`Sessions found: ${JSON.stringify(sessions.map((s: unknown) => {
    if (s && typeof s === 'object') {
      const { name, status } = s as Record<string, unknown>;
      return { name, status };
    }
    return s;
  }))}`);
  process.exit(2);
}

const sessionName = String(workingSession['name']);
note(`Using session: "${sessionName}" (status: WORKING)`);

subsection('Sessions array field schema');
if (sessions.length > 0) {
  const fields = inspectFields(sessions);
  for (const [k, v] of Object.entries(fields)) {
    bullet(`\`${k}\`: ${v}`);
  }
  lines.push('');
}

subsection('First session entry (redacted)');
code('json', JSON.stringify(redactObject(workingSession), null, 2));

// ── Probe 2: GET /api/{session}/chats ────────────────────────────────────────

section('Probe 2 — GET /api/{session}/chats');
bullet(`Request: GET ${BASE_URL}/api/${sessionName}/chats`);
lines.push('');

const chatsResult = await wahaGet(`/api/${sessionName}/chats`);
bullet(`HTTP status: ${chatsResult.status}`);
lines.push('');

if (!chatsResult.ok) {
  note(`WARN: GET /api/{session}/chats returned ${chatsResult.status}. Body: ${JSON.stringify(chatsResult.body)}`);
} else {
  const chats = Array.isArray(chatsResult.body) ? chatsResult.body : [];
  note(`Total chats returned: ${chats.length}`);

  subsection('Chat entry field schema (observed across all entries)');
  const chatFields = inspectFields(chats);
  for (const [k, v] of Object.entries(chatFields)) {
    bullet(`\`${k}\`: ${v}`);
  }
  lines.push('');

  subsection('First 3 chat entries (redacted)');
  const sample = chats.slice(0, 3);
  code('json', JSON.stringify(redactObject(sample), null, 2));

  // Pick first chat for the next probe
  const firstChat = chats[0] as Record<string, unknown> | undefined;
  const firstChatId = firstChat ? String(firstChat['id']) : null;

  if (firstChatId) {
    note(`First chatId (redacted): ${redactPhones(firstChatId)}`);

    // ── Probe 3: GET /api/{session}/chats/{chatId}/messages ─────────────────

    section('Probe 3 — GET /api/{session}/chats/{chatId}/messages?limit=20');
    bullet(`Request: GET ${BASE_URL}/api/${sessionName}/chats/<chatId>/messages?limit=20`);
    lines.push('');

    const messagesResult = await wahaGet(`/api/${sessionName}/chats/${firstChatId}/messages`, { limit: '20' });
    bullet(`HTTP status: ${messagesResult.status}`);
    lines.push('');

    if (!messagesResult.ok) {
      note(`WARN: messages endpoint returned ${messagesResult.status}. Body: ${JSON.stringify(messagesResult.body)}`);
    } else {
      const messages = Array.isArray(messagesResult.body) ? messagesResult.body : [];
      note(`Messages returned: ${messages.length}`);

      subsection('Message field schema (observed across all returned messages)');
      const msgFields = inspectFields(messages);
      for (const [k, v] of Object.entries(msgFields)) {
        bullet(`\`${k}\`: ${v}`);
      }
      lines.push('');

      // Check for reactions field
      const withReactions = messages.filter((m: unknown) => {
        if (m && typeof m === 'object' && 'reactions' in (m as object)) {
          const r = (m as Record<string, unknown>)['reactions'];
          return Array.isArray(r) && r.length > 0;
        }
        return false;
      });

      subsection('Reactions field presence');
      if (withReactions.length > 0) {
        note(`Found ${withReactions.length} message(s) with non-empty reactions array.`);
        const firstReacted = withReactions[0] as Record<string, unknown>;
        bullet(`reactions field type: ${inferType(firstReacted['reactions'])}`);
        const reactionsArr = firstReacted['reactions'] as unknown[];
        if (reactionsArr.length > 0) {
          subsection('Reaction entry field schema');
          const reactionFields = inspectFields(reactionsArr);
          for (const [k, v] of Object.entries(reactionFields)) {
            bullet(`\`${k}\`: ${v}`);
          }
          lines.push('');
          code('json', JSON.stringify(redactObject(reactionsArr[0]), null, 2));
        }
      } else {
        note('No messages with non-empty reactions found in this sample. reactions field may still be present as empty array.');
        const withReactionsField = messages.filter((m: unknown) => {
          return m && typeof m === 'object' && 'reactions' in (m as object);
        });
        bullet(`Messages with reactions field present: ${withReactionsField.length} of ${messages.length}`);
      }
      lines.push('');

      // Check for quotedMessage / replyTo field
      subsection('quotedMessage / replyTo field presence');
      const fieldsWithQuoted = messages.filter((m: unknown) => {
        if (!m || typeof m !== 'object') return false;
        const obj = m as Record<string, unknown>;
        return 'quotedMessage' in obj || '_data' in obj;
      });
      if (fieldsWithQuoted.length > 0) {
        note(`Found ${fieldsWithQuoted.length} message(s) with quotedMessage field.`);
        const sample = (fieldsWithQuoted[0] as Record<string, unknown>)['quotedMessage'];
        if (sample && typeof sample === 'object') {
          const qFields = inspectFields([sample]);
          for (const [k, v] of Object.entries(qFields)) {
            bullet(`quotedMessage.\`${k}\`: ${v}`);
          }
          lines.push('');
        }
      } else {
        note('No messages with quotedMessage found in this sample (may not have reply-to messages in this chat).');
      }

      // Check for media fields
      subsection('Media field presence');
      const withMedia = messages.filter((m: unknown) => {
        if (!m || typeof m !== 'object') return false;
        return (m as Record<string, unknown>)['hasMedia'] === true;
      });
      if (withMedia.length > 0) {
        note(`Found ${withMedia.length} message(s) with hasMedia=true.`);
        const firstMedia = withMedia[0] as Record<string, unknown>;
        const mediaFields = Object.keys(firstMedia).filter(k => ['hasMedia', 'media', 'mimetype', 'mediaMimetype', '_data'].includes(k));
        for (const k of mediaFields) {
          bullet(`\`${k}\`: ${inferType(firstMedia[k])}`);
        }
        lines.push('');
        code('json', JSON.stringify(redactObject(firstMedia), null, 2));
      } else {
        note('No messages with hasMedia=true found in this sample.');
      }

      subsection('Up to 5 messages (all fields, redacted)');
      code('json', JSON.stringify(redactObject(messages.slice(0, 5)), null, 2));
    }
  }
}

// ── Probe 4: POST /api/sendImage (empty body → validation error) ─────────────

section('Probe 4 — POST /api/sendImage (empty body — discover payload schema)');
bullet(`Request: POST ${BASE_URL}/api/sendImage  body: {}`);
lines.push('');
note('Intentionally sending empty body to capture the validation error shape (reveals required fields).');

const sendImageResult = await wahaPost('/api/sendImage', {});
bullet(`HTTP status: ${sendImageResult.status}`);
lines.push('');
code('json', JSON.stringify(redactObject(sendImageResult.body), null, 2));

// ── Probe 5: POST /api/{session}/sendReaction (empty body) ───────────────────

section('Probe 5 — POST /api/{session}/sendReaction (empty body — discover payload schema)');

// Try session-namespaced path first, then bare path
const reactionPathsToTry = [
  `/api/${sessionName}/sendReaction`,
  '/api/sendReaction',
  `/api/${sessionName}/reaction`,
  '/api/reaction',
];

for (const reactionPath of reactionPathsToTry) {
  subsection(`Trying: POST ${reactionPath}`);
  const reactionResult = await wahaPost(reactionPath, {});
  bullet(`HTTP status: ${reactionResult.status}`);
  lines.push('');
  code('json', JSON.stringify(redactObject(reactionResult.body), null, 2));

  // If not 404, this is likely the right path
  if (reactionResult.status !== 404) {
    note(`This path returned ${reactionResult.status} (not 404) — likely the correct endpoint for sendReaction.`);
    break;
  } else {
    note('404 — path not found, trying next variant.');
  }
}

// ── Probe 6: POST /api/sendText with reply_to vs quotedMessageId ─────────────

section('Probe 6 — POST /api/sendText: reply_to vs quotedMessageId param name');
note('Sending to invalid chatId with an invalid messageId to see which param name WAHA recognizes. No real message is sent.');

const fakeMessageId = 'false_1234567890_AABBCC_1234567890';

subsection('Variant A: using reply_to');
const sendTextA = await wahaPost('/api/sendText', {
  session: sessionName,
  chatId: 'probe-smoke-test-invalid',
  text: 'smoke-probe-reply-field-test',
  reply_to: fakeMessageId,
});
bullet(`HTTP status: ${sendTextA.status}`);
lines.push('');
code('json', JSON.stringify(redactObject(sendTextA.body), null, 2));

subsection('Variant B: using quotedMessageId');
const sendTextB = await wahaPost('/api/sendText', {
  session: sessionName,
  chatId: 'probe-smoke-test-invalid',
  text: 'smoke-probe-reply-field-test',
  quotedMessageId: fakeMessageId,
});
bullet(`HTTP status: ${sendTextB.status}`);
lines.push('');
code('json', JSON.stringify(redactObject(sendTextB.body), null, 2));

subsection('Variant C: using replyTo (camelCase)');
const sendTextC = await wahaPost('/api/sendText', {
  session: sessionName,
  chatId: 'probe-smoke-test-invalid',
  text: 'smoke-probe-reply-field-test',
  replyTo: fakeMessageId,
});
bullet(`HTTP status: ${sendTextC.status}`);
lines.push('');
code('json', JSON.stringify(redactObject(sendTextC.body), null, 2));

// ── Probe 7: message.reaction webhook — deferred ──────────────────────────────

section('Probe 7 — message.reaction webhook payload shape');
note('This payload is only observable when a real reaction arrives via the WAHA webhook. Cannot be captured by this script alone.');
note('ACTION REQUIRED: React to a message from the linked phone, then check the worker webhook logs for a `message.reaction` payload. Capture the shape and add it to the engram observation `sdd/whatsapp-chat-ui/batch-0-shapes`.');
note('DEFERRED — capture in Batch 14 manual QA. Inferred schema based on WAHA Plus documentation:');
lines.push('');
code('typescript', `// Expected message.reaction webhook payload (inferred — verify in Batch 14)
// WAHA Plus emits this event type when a WhatsApp reaction is added or removed.
// The \`data\` field wraps the event, consistent with other WAHA webhook events.
{
  event: "message.reaction",
  session: string,          // session name
  me: { id: string, pushname: string },
  payload: {
    id: string,             // reaction event id
    from: string,           // JID of reactor (redacted: phone digits)
    fromMe: boolean,
    participant?: string,   // in group chats
    to: string,             // JID of chat
    timestamp: number,
    reaction: {
      text: string,         // emoji character, empty string = remove reaction
      msgId: {
        fromMe: boolean,
        remote: string,     // JID
        id: string,         // message id the reaction is on
        _serialized: string
      }
    }
  }
}`);

// ── Summary and Inferred Schemas ─────────────────────────────────────────────

section('Summary — Inferred Zod Schemas');
note('Based on observed shapes above. Use .passthrough() throughout to tolerate unknown WAHA Plus fields.');
lines.push('');

code('typescript', `import { z } from 'zod';

// ── Chat list entry (from GET /api/{session}/chats) ────────────────────────
export const WahaChatListEntrySchema = z.object({
  id: z.string(),                          // chatId (e.g. "DIGITS@s.whatsapp.net")
  name: z.string().optional().nullable(),   // contact display name (may be absent)
  isGroup: z.boolean().optional().default(false),
  timestamp: z.number().optional().nullable(),
  unreadCount: z.number().optional().default(0),
  lastMessage: z.object({
    body: z.string().optional(),
    timestamp: z.number().optional(),
    fromMe: z.boolean().optional(),
    hasMedia: z.boolean().optional(),
  }).optional().nullable(),
  picture: z.string().optional().nullable(), // URL or base64 avatar
}).passthrough();

export type WahaChatListEntry = z.infer<typeof WahaChatListEntrySchema>;

// ── Inline reaction on a message ────────────────────────────────────────────
export const WahaChatReactionSchema = z.object({
  text: z.string(),        // emoji character
  senderKeyHash: z.string().optional(),
  senderId: z.string().optional(), // JID
  timestamp: z.number().optional(),
}).passthrough();

export type WahaChatReaction = z.infer<typeof WahaChatReactionSchema>;

// ── Quoted message reference ─────────────────────────────────────────────────
export const WahaQuotedMessageSchema = z.object({
  id: z.string().optional(),
  body: z.string().optional(),
  type: z.string().optional(),
  participant: z.string().optional(),
  hasMedia: z.boolean().optional(),
}).passthrough();

export type WahaQuotedMessage = z.infer<typeof WahaQuotedMessageSchema>;

// ── Full chat message (from GET /api/{session}/chats/{chatId}/messages) ─────
export const WahaChatMessageSchema = z.object({
  id: z.string(),
  timestamp: z.number().optional(),
  from: z.string().optional(),      // JID (phone redacted in runtime)
  fromMe: z.boolean().optional().default(false),
  body: z.string().optional().default(''),
  hasMedia: z.boolean().optional().default(false),
  media: z.object({
    url: z.string().optional(),
    mimetype: z.string().optional(),
    s3: z.object({ Bucket: z.string(), Key: z.string() }).optional(),
  }).optional().nullable(),
  reactions: z.array(WahaChatReactionSchema).optional().default([]),
  quotedMessage: WahaQuotedMessageSchema.optional().nullable(),
  _data: z.unknown().optional(),    // raw WAHA internal field when present
}).passthrough();

export type WahaChatMessage = z.infer<typeof WahaChatMessageSchema>;

// ── Inbound message.reaction webhook payload ─────────────────────────────────
// DEFERRED — full verification in Batch 14. Schema below is inferred.
export const WahaInboundReactionPayloadSchema = z.object({
  event: z.literal('message.reaction'),
  session: z.string(),
  payload: z.object({
    id: z.string().optional(),
    from: z.string().optional(),
    fromMe: z.boolean().optional(),
    to: z.string().optional(),
    timestamp: z.number().optional(),
    reaction: z.object({
      text: z.string(),   // emoji or empty string (remove)
      msgId: z.object({
        fromMe: z.boolean().optional(),
        remote: z.string().optional(),
        id: z.string(),
        _serialized: z.string().optional(),
      }).passthrough(),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

export type WahaInboundReactionPayload = z.infer<typeof WahaInboundReactionPayloadSchema>;
`);

section('Open Items / Follow-ups for Batch 1');
bullet('Confirm exact field names for `sendImage` from Probe 4 validation error body (check `errors` or `message` array).');
bullet('Confirm exact reaction endpoint path from Probe 5 (which path returned non-404).');
bullet('Confirm which sendText reply param name WAHA accepts from Probe 6 (compare status codes — 422 vs 404).');
bullet('DEFERRED: Capture live `message.reaction` webhook payload in Batch 14 manual QA (Probe 7).');
bullet('Confirm WAHA Plus license covers reactions + quoted replies (check WAHA admin UI license tab).');

// ── Print report ─────────────────────────────────────────────────────────────

console.log(lines.join('\n'));
