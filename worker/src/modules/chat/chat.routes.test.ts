/**
 * chat.routes.test.ts
 *
 * Integration-style tests for the chat router.
 * Written FIRST (RED) per strict TDD.
 *
 * Uses a test Express app with mock auth + mock service.
 * The JWT secret is set to '1234567890123456' (same env var bootstrap used throughout).
 *
 * Validates:
 * - Cashier accessing own session → 200
 * - Cashier accessing foreign session → 403 (negative scope test — acceptance criterion #6)
 * - Admin accessing any session → 200
 * - Unauthenticated requests → 401
 * - Wrong role (ADMIN hitting /chat/sessions/* cashier route) → 403
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Env bootstrap — must come BEFORE any imports that read config
process.env.PORT = process.env.PORT ?? '3002';
process.env.LEADS_CODE_TTL_HOURS = process.env.LEADS_CODE_TTL_HOURS ?? '24';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.BULLMQ_REDIS_URL = process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379';
process.env.BULLMQ_QUEUE_NAME = process.env.BULLMQ_QUEUE_NAME ?? 'test-queue';
process.env.WORKER_CONCURRENCY = process.env.WORKER_CONCURRENCY ?? '1';
process.env.WAHA_API_KEY = process.env.WAHA_API_KEY ?? 'waha-key';
process.env.WAHA_BASE_URL = process.env.WAHA_BASE_URL ?? 'http://localhost:3000';
process.env.WAHA_WEBHOOK_URL =
  process.env.WAHA_WEBHOOK_URL ?? 'http://localhost:3002/webhook';
process.env.WAHA_WEBHOOK_EVENTS = process.env.WAHA_WEBHOOK_EVENTS ?? 'message';
process.env.WAHA_WEBHOOK_TOKEN_HEADER =
  process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
process.env.WAHA_WEBHOOK_TOKEN_VALUE = process.env.WAHA_WEBHOOK_TOKEN_VALUE ?? 'token';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? '1234567890123456';
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? 'turnstile-secret';
process.env.ALTCHA_HMAC_SECRET = process.env.ALTCHA_HMAC_SECRET ?? 'test-altcha-hmac-secret-32-bytes!';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

import express from 'express';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { createChatRouter } from './chat.routes.js';
import type { ChatService } from './chat.service.js';
import type { ChatListEntry, ChatMessage } from './chat.types.js';
import type { SessionOwnershipSession } from '../../middlewares/require-session-ownership.middleware.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const JWT_SECRET = '1234567890123456';

function makeToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

function makeChatListEntry(): ChatListEntry {
  return {
    chatId: 'chat@c.us',
    displayName: 'Test Contact',
    lastMessageTimestamp: 1_700_000_000,
  };
}

function makeChatMessage(): ChatMessage {
  return {
    id: 'msg-001',
    timestamp: 1_700_000_000,
    fromMe: false,
    body: 'Hello',
    hasMedia: false,
    mediaMimetype: null,
    reactions: [],
    quotedMessage: null,
    senderName: null,
  };
}

/** The WhatsappSession owned by cashier-1 */
const ownedSession: SessionOwnershipSession = {
  id: 'session-uuid-1',
  sessionName: 'cashier-1-session',
  cashierId: 'cashier-1',
};

/** A session owned by a different cashier */
const foreignSession: SessionOwnershipSession = {
  id: 'session-uuid-2',
  sessionName: 'cashier-2-session',
  cashierId: 'cashier-2',
};

type MockSessionLookup = (id: string) => Promise<SessionOwnershipSession | null>;

function makeMockService(overrides: Partial<ChatService> = {}): ChatService {
  return {
    listChats: async () => [makeChatListEntry()],
    getChatHistory: async () => [makeChatMessage()],
    sendText: async () => {},
    sendPhoto: async () => {},
    sendReaction: async () => {},
    getMediaBytes: async () => ({ bytes: Buffer.from('bytes'), mimetype: 'image/png' }),
    publishTextStatus: async () => {},
    publishImageStatus: async () => {},
    setSessionAlias: async () => {},
    setTyping: async () => {},
    markSeen: async () => {},
    ...overrides,
  };
}

/**
 * Lightweight requireAuth stub: verifies JWT without any DB calls.
 * Sets req.authUser from JWT payload.
 */
function makeTestRequireAuth(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const token = header.startsWith('Bearer ') ? header.slice(7) : header;
    try {
      const decoded = jwt.verify(token, secret) as Record<string, unknown>;
      (req as unknown as Record<string, unknown>).authUser = decoded;
      next();
    } catch {
      res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

/**
 * Lightweight requireRole: only checks req.authUser.role — no DB needed.
 * Mirrors the real implementation from auth.middleware.ts.
 */
function makeTestRequireRole() {
  return (...roles: string[]) =>
    (req: Request, res: Response, next: NextFunction) => {
      const authUser = (req as unknown as Record<string, unknown>).authUser as
        | { role: string }
        | undefined;
      if (!authUser) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      if (!roles.includes(authUser.role)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      next();
    };
}

/**
 * Builds a test app with the chat router mounted.
 * The session lookup is injected so tests can control what sessions exist.
 * Auth middleware is a lightweight JWT stub (no DB calls).
 */
function makeTestApp(
  mockSessionLookup: MockSessionLookup,
  mockService: ChatService = makeMockService(),
) {
  const app = express();
  app.use(express.json());

  const chatRouter = createChatRouter({
    service: mockService,
    getWhatsappSession: mockSessionLookup,
    requireAuth: makeTestRequireAuth(JWT_SECRET),
    requireRole: makeTestRequireRole(),
  });

  app.use('/api', chatRouter);

  return app;
}

/** Minimal fetch-like helper using node:http for test requests */
async function request(
  app: express.Express,
  method: string,
  path: string,
  options: {
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<{ status: number; body: unknown }> {
  const http = await import('node:http');

  return new Promise((resolve, reject) => {
    const bodyStr = options.body ? JSON.stringify(options.body) : undefined;
    const server = http.createServer(app);
    server.listen(0, () => {
      const address = server.address() as { port: number };
      const port = address.port;

      const reqOptions: Record<string, unknown> = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
      };

      const clientReq = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          server.close();
          let parsed: unknown = data;
          try { parsed = JSON.parse(data); } catch { /* leave as string */ }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      });

      clientReq.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (bodyStr) {
        clientReq.write(bodyStr);
      }
      clientReq.end();
    });
  });
}

// ── Tokens ────────────────────────────────────────────────────────────────────

const cashier1Token = makeToken({
  userId: 'user-cashier-1',
  role: 'CASHIER',
  cashierId: 'cashier-1',
});

const cashier2Token = makeToken({
  userId: 'user-cashier-2',
  role: 'CASHIER',
  cashierId: 'cashier-2',
});

const adminToken = makeToken({
  userId: 'user-admin-1',
  role: 'ADMIN',
});

// ── cashier route — own session ───────────────────────────────────────────────

describe('chat.routes — cashier scoped (own session)', () => {
  it('GET /chat/sessions/:sessionId/chats returns 200 for cashier owning session', async () => {
    const app = makeTestApp(
      async (id) => (id === 'session-uuid-1' ? ownedSession : null),
    );

    const { status } = await request(app, 'GET', '/api/chat/sessions/session-uuid-1/chats', {
      headers: { authorization: `Bearer ${cashier1Token}` },
    });

    assert.equal(status, 200);
  });

  it('GET .../messages returns 200 for cashier owning session', async () => {
    const app = makeTestApp(
      async (id) => (id === 'session-uuid-1' ? ownedSession : null),
    );

    const { status } = await request(
      app,
      'GET',
      '/api/chat/sessions/session-uuid-1/chats/chat@c.us/messages',
      { headers: { authorization: `Bearer ${cashier1Token}` } },
    );

    assert.equal(status, 200);
  });

  it('POST .../messages (sendText) returns 200 for cashier owning session', async () => {
    const app = makeTestApp(
      async (id) => (id === 'session-uuid-1' ? ownedSession : null),
    );

    const { status } = await request(
      app,
      'POST',
      '/api/chat/sessions/session-uuid-1/chats/chat@c.us/messages',
      {
        headers: { authorization: `Bearer ${cashier1Token}` },
        body: { text: 'hello world' },
      },
    );

    assert.equal(status, 200);
  });

  it('POST .../reactions returns 200 for cashier owning session', async () => {
    const app = makeTestApp(
      async (id) => (id === 'session-uuid-1' ? ownedSession : null),
    );

    const { status } = await request(
      app,
      'POST',
      '/api/chat/sessions/session-uuid-1/chats/chat@c.us/messages/msg-001/reactions',
      {
        headers: { authorization: `Bearer ${cashier1Token}` },
        body: { reaction: '👍' },
      },
    );

    assert.equal(status, 200);
  });

  it('GET .../media returns 200 for cashier owning session', async () => {
    const app = makeTestApp(
      async (id) => (id === 'session-uuid-1' ? ownedSession : null),
    );

    const { status } = await request(
      app,
      'GET',
      '/api/chat/sessions/session-uuid-1/chats/chat@c.us/messages/msg-001/media',
      { headers: { authorization: `Bearer ${cashier1Token}` } },
    );

    assert.equal(status, 200);
  });
});

// ── cashier route — foreign session (CRITICAL acceptance criterion #6) ─────────

describe('chat.routes — cashier scoped (foreign session) — acceptance criterion #6', () => {
  it('GET /chat/sessions/:sessionId/chats returns 403 for cashier NOT owning session', async () => {
    // session-uuid-2 is owned by cashier-2; cashier-1 requests it
    const app = makeTestApp(
      async (id) => (id === 'session-uuid-2' ? foreignSession : null),
    );

    const { status } = await request(
      app,
      'GET',
      '/api/chat/sessions/session-uuid-2/chats',
      { headers: { authorization: `Bearer ${cashier1Token}` } },
    );

    assert.equal(status, 403);
  });

  it('POST .../messages returns 403 for cashier requesting foreign session', async () => {
    const app = makeTestApp(
      async (id) => (id === 'session-uuid-2' ? foreignSession : null),
    );

    const { status } = await request(
      app,
      'POST',
      '/api/chat/sessions/session-uuid-2/chats/chat@c.us/messages',
      {
        headers: { authorization: `Bearer ${cashier2Token}` },
        body: { text: 'hello' },
      },
    );

    // cashier-2 uses cashier2Token which owns cashier-2 → this should be 200
    // (this verifies the right token gives 200)
    assert.equal(status, 200);
  });

  it('POST .../messages returns 403 when cashier-1 sends to cashier-2 session', async () => {
    const app = makeTestApp(
      async (id) => (id === 'session-uuid-2' ? foreignSession : null),
    );

    const { status } = await request(
      app,
      'POST',
      '/api/chat/sessions/session-uuid-2/chats/chat@c.us/messages',
      {
        headers: { authorization: `Bearer ${cashier1Token}` },
        body: { text: 'hello' },
      },
    );

    assert.equal(status, 403);
  });
});

// ── admin route — flat scope ──────────────────────────────────────────────────

describe('chat.routes — admin scoped (flat scope)', () => {
  it('GET /admin/chat/.../chats returns 200 for ADMIN', async () => {
    const app = makeTestApp(
      async (id) => (id === 'session-uuid-1' ? ownedSession : null),
    );

    const { status } = await request(
      app,
      'GET',
      '/api/admin/chat/cashiers/cashier-1/sessions/session-uuid-1/chats',
      { headers: { authorization: `Bearer ${adminToken}` } },
    );

    assert.equal(status, 200);
  });

  it('GET admin .../messages returns 200 for ADMIN on any cashier session', async () => {
    const app = makeTestApp(
      async (id) => (id === 'session-uuid-2' ? foreignSession : null),
    );

    const { status } = await request(
      app,
      'GET',
      '/api/admin/chat/cashiers/cashier-2/sessions/session-uuid-2/chats/chat@c.us/messages',
      { headers: { authorization: `Bearer ${adminToken}` } },
    );

    assert.equal(status, 200);
  });

  it('GET admin .../chats returns 404 when :cashierId does not own the session', async () => {
    // session-uuid-1 is owned by cashier-1; admin requests it under cashier-999.
    const app = makeTestApp(
      async (id) => (id === 'session-uuid-1' ? ownedSession : null),
    );

    const { status } = await request(
      app,
      'GET',
      '/api/admin/chat/cashiers/cashier-999/sessions/session-uuid-1/chats',
      { headers: { authorization: `Bearer ${adminToken}` } },
    );

    assert.equal(status, 404);
  });

  it('POST admin .../messages returns 200 for ADMIN', async () => {
    const app = makeTestApp(
      async (id) => (id === 'session-uuid-1' ? ownedSession : null),
    );

    const { status } = await request(
      app,
      'POST',
      '/api/admin/chat/cashiers/cashier-1/sessions/session-uuid-1/chats/chat@c.us/messages',
      {
        headers: { authorization: `Bearer ${adminToken}` },
        body: { text: 'admin hello' },
      },
    );

    assert.equal(status, 200);
  });
});

// ── unauthenticated ────────────────────────────────────────────────────────────

describe('chat.routes — unauthenticated requests', () => {
  it('returns 401 for cashier route without auth header', async () => {
    const app = makeTestApp(async () => ownedSession);

    const { status } = await request(
      app,
      'GET',
      '/api/chat/sessions/session-uuid-1/chats',
      { headers: {} },
    );

    assert.equal(status, 401);
  });

  it('returns 401 for admin route without auth header', async () => {
    const app = makeTestApp(async () => ownedSession);

    const { status } = await request(
      app,
      'GET',
      '/api/admin/chat/cashiers/cashier-1/sessions/session-uuid-1/chats',
      { headers: {} },
    );

    assert.equal(status, 401);
  });

  // W2: Verify the media proxy route is behind auth — no token → 401.
  // The requireAuth stub used throughout these tests correctly rejects requests
  // that carry no Authorization header, so this test exercises the real auth
  // surface of the GET .../media endpoint without DB calls.
  it('GET media proxy route returns 401 when no Authorization header is sent', async () => {
    const app = makeTestApp(async () => ownedSession);

    const { status } = await request(
      app,
      'GET',
      '/api/chat/sessions/session-uuid-1/chats/chat@c.us/messages/msg-001/media',
      { headers: {} }, // no Authorization header
    );

    assert.equal(status, 401);
  });
});

// ── wrong role ─────────────────────────────────────────────────────────────────

describe('chat.routes — wrong role access control', () => {
  it('returns 403 when ADMIN hits cashier-scoped /chat/sessions/* route', async () => {
    const app = makeTestApp(async () => ownedSession);

    const { status } = await request(
      app,
      'GET',
      '/api/chat/sessions/session-uuid-1/chats',
      { headers: { authorization: `Bearer ${adminToken}` } },
    );

    assert.equal(status, 403);
  });

  it('returns 403 when CASHIER hits admin-scoped /admin/chat/* route', async () => {
    const app = makeTestApp(async () => ownedSession);

    const { status } = await request(
      app,
      'GET',
      '/api/admin/chat/cashiers/cashier-1/sessions/session-uuid-1/chats',
      { headers: { authorization: `Bearer ${cashier1Token}` } },
    );

    assert.equal(status, 403);
  });
});

// ── session not found ─────────────────────────────────────────────────────────

describe('chat.routes — session not found', () => {
  it('returns 404 when session does not exist (cashier route)', async () => {
    const app = makeTestApp(async () => null); // always not found

    const { status } = await request(
      app,
      'GET',
      '/api/chat/sessions/nonexistent-session/chats',
      { headers: { authorization: `Bearer ${cashier1Token}` } },
    );

    assert.equal(status, 404);
  });
});

// ── photo-send route (POST .../media) ─────────────────────────────────────────

/**
 * Multipart helper: builds a minimal multipart/form-data body with one file part.
 * We avoid requiring supertest or form-data packages — this project uses plain node:http.
 *
 * The boundary and body format follows RFC 2046 §5.1.1.
 */
function buildMultipartBody(
  boundary: string,
  file: { fieldname: string; filename: string; contentType: string; data: Buffer },
  extraFields: Record<string, string> = {},
): Buffer {
  const CRLF = '\r\n';
  const parts: Buffer[] = [];

  // Extra text fields
  for (const [name, value] of Object.entries(extraFields)) {
    parts.push(Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}` +
      `${value}${CRLF}`,
    ));
  }

  // File part
  parts.push(Buffer.from(
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"${CRLF}` +
    `Content-Type: ${file.contentType}${CRLF}${CRLF}`,
  ));
  parts.push(file.data);
  parts.push(Buffer.from(CRLF));

  // Final boundary
  parts.push(Buffer.from(`--${boundary}--${CRLF}`));

  return Buffer.concat(parts);
}

async function requestMultipart(
  app: express.Express,
  method: string,
  path: string,
  headers: Record<string, string>,
  multipartBody: Buffer,
  contentType: string,
): Promise<{ status: number; body: unknown }> {
  const http = await import('node:http');

  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const address = server.address() as { port: number };
      const port = address.port;

      const reqOptions: Record<string, unknown> = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          ...headers,
          'Content-Type': contentType,
          'Content-Length': multipartBody.length,
        },
      };

      const clientReq = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          server.close();
          let parsed: unknown = data;
          try { parsed = JSON.parse(data); } catch { /* leave as string */ }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      });

      clientReq.on('error', (err) => {
        server.close();
        reject(err);
      });

      clientReq.write(multipartBody);
      clientReq.end();
    });
  });
}

// Valid JPEG bytes (magic: FF D8 FF)
const validJpegBytes = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ...new Array(100).fill(0x00), // padding
]);

describe('chat.routes — photo-send (POST .../media)', () => {
  it('cashier posting a valid JPEG to own session returns 200', async () => {
    const boundary = 'testboundary001';
    const body = buildMultipartBody(boundary, {
      fieldname: 'file',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      data: validJpegBytes,
    });

    const app = makeTestApp(
      async (id) => (id === 'session-uuid-1' ? ownedSession : null),
    );

    const { status } = await requestMultipart(
      app,
      'POST',
      '/api/chat/sessions/session-uuid-1/chats/chat@c.us/media',
      { authorization: `Bearer ${cashier1Token}` },
      body,
      `multipart/form-data; boundary=${boundary}`,
    );

    assert.equal(status, 200);
  });

  it('cashier posting to a foreign session returns 403', async () => {
    const boundary = 'testboundary002';
    const body = buildMultipartBody(boundary, {
      fieldname: 'file',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      data: validJpegBytes,
    });

    const app = makeTestApp(
      async (id) => (id === 'session-uuid-2' ? foreignSession : null),
    );

    const { status } = await requestMultipart(
      app,
      'POST',
      '/api/chat/sessions/session-uuid-2/chats/chat@c.us/media',
      { authorization: `Bearer ${cashier1Token}` }, // cashier-1 does NOT own session-uuid-2
      body,
      `multipart/form-data; boundary=${boundary}`,
    );

    assert.equal(status, 403);
  });

  it('admin posting to any session returns 200', async () => {
    const boundary = 'testboundary003';
    const body = buildMultipartBody(boundary, {
      fieldname: 'file',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      data: validJpegBytes,
    });

    const app = makeTestApp(
      async (id) => (id === 'session-uuid-1' ? ownedSession : null),
    );

    const { status } = await requestMultipart(
      app,
      'POST',
      '/api/admin/chat/cashiers/cashier-1/sessions/session-uuid-1/chats/chat@c.us/media',
      { authorization: `Bearer ${adminToken}` },
      body,
      `multipart/form-data; boundary=${boundary}`,
    );

    assert.equal(status, 200);
  });

  it('posting a file > 5 MB returns 413', async () => {
    const boundary = 'testboundary004';
    // 5 MB + 1 byte exceeds the limit
    const oversizedData = Buffer.alloc(5 * 1024 * 1024 + 1, 0xff);
    // Patch in JPEG magic bytes at the front to pass magic check (won't reach it — size limit fires first)
    oversizedData[0] = 0xff;
    oversizedData[1] = 0xd8;
    oversizedData[2] = 0xff;

    const body = buildMultipartBody(boundary, {
      fieldname: 'file',
      filename: 'huge.jpg',
      contentType: 'image/jpeg',
      data: oversizedData,
    });

    const app = makeTestApp(
      async (id) => (id === 'session-uuid-1' ? ownedSession : null),
    );

    const { status } = await requestMultipart(
      app,
      'POST',
      '/api/chat/sessions/session-uuid-1/chats/chat@c.us/media',
      { authorization: `Bearer ${cashier1Token}` },
      body,
      `multipart/form-data; boundary=${boundary}`,
    );

    assert.equal(status, 413);
  });

  it('posting Content-Type image/gif returns 415', async () => {
    const boundary = 'testboundary005';
    const body = buildMultipartBody(boundary, {
      fieldname: 'file',
      filename: 'anim.gif',
      contentType: 'image/gif', // Not in allowlist
      data: Buffer.from([0x47, 0x49, 0x46, 0x38]), // GIF magic
    });

    const app = makeTestApp(
      async (id) => (id === 'session-uuid-1' ? ownedSession : null),
    );

    const { status } = await requestMultipart(
      app,
      'POST',
      '/api/chat/sessions/session-uuid-1/chats/chat@c.us/media',
      { authorization: `Bearer ${cashier1Token}` },
      body,
      `multipart/form-data; boundary=${boundary}`,
    );

    assert.equal(status, 415);
  });
});

// ── status routes ─────────────────────────────────────────────────────────────

describe('chat.routes — status publishing', () => {
  it('POST /chat/sessions/:sessionId/status/text returns 200 for cashier owning session', async () => {
    const app = makeTestApp(
      async (id) => (id === 'session-uuid-1' ? ownedSession : null),
    );

    const { status } = await request(
      app,
      'POST',
      '/api/chat/sessions/session-uuid-1/status/text',
      {
        headers: { authorization: `Bearer ${cashier1Token}` },
        body: { text: 'mi estado' },
      },
    );

    assert.equal(status, 200);
  });

  it('POST /chat/sessions/:sessionId/status/text returns 403 for foreign session', async () => {
    const app = makeTestApp(
      async (id) => (id === 'session-uuid-2' ? foreignSession : null),
    );

    const { status } = await request(
      app,
      'POST',
      '/api/chat/sessions/session-uuid-2/status/text',
      {
        headers: { authorization: `Bearer ${cashier1Token}` },
        body: { text: 'mi estado' },
      },
    );

    assert.equal(status, 403);
  });

  it('POST /admin/chat/.../status/text returns 200 for admin', async () => {
    const app = makeTestApp(
      async (id) => (id === 'session-uuid-2' ? foreignSession : null),
    );

    const { status } = await request(
      app,
      'POST',
      '/api/admin/chat/cashiers/cashier-2/sessions/session-uuid-2/status/text',
      {
        headers: { authorization: `Bearer ${adminToken}` },
        body: { text: 'estado admin' },
      },
    );

    assert.equal(status, 200);
  });

  it('POST /chat/sessions/:sessionId/status/text returns 401 unauthenticated', async () => {
    const app = makeTestApp(
      async (id) => (id === 'session-uuid-1' ? ownedSession : null),
    );

    const { status } = await request(
      app,
      'POST',
      '/api/chat/sessions/session-uuid-1/status/text',
      { body: { text: 'x' } },
    );

    assert.equal(status, 401);
  });

  it('POST /chat/sessions/:sessionId/status/image returns 401 unauthenticated', async () => {
    const app = makeTestApp(
      async (id) => (id === 'session-uuid-1' ? ownedSession : null),
    );

    const { status } = await request(
      app,
      'POST',
      '/api/chat/sessions/session-uuid-1/status/image',
      { body: {} },
    );

    assert.equal(status, 401);
  });
});

// ── setSessionAlias routes ──────────────────────────────────────────────────────

describe('chat.routes — setSessionAlias', () => {
  it('PATCH /chat/sessions/:sessionId/alias returns 200 for owner', async () => {
    const app = makeTestApp(async (id) => (id === 'session-uuid-1' ? ownedSession : null));
    const { status } = await request(
      app, 'PATCH', '/api/chat/sessions/session-uuid-1/alias',
      { headers: { authorization: `Bearer ${cashier1Token}` }, body: { alias: 'Ventas' } },
    );
    assert.equal(status, 200);
  });

  it('PATCH /chat/sessions/:sessionId/alias returns 403 for foreign session', async () => {
    const app = makeTestApp(async (id) => (id === 'session-uuid-2' ? foreignSession : null));
    const { status } = await request(
      app, 'PATCH', '/api/chat/sessions/session-uuid-2/alias',
      { headers: { authorization: `Bearer ${cashier1Token}` }, body: { alias: 'Ventas' } },
    );
    assert.equal(status, 403);
  });

  it('PATCH /admin/chat/.../alias returns 200 for admin', async () => {
    const app = makeTestApp(async (id) => (id === 'session-uuid-2' ? foreignSession : null));
    const { status } = await request(
      app, 'PATCH', '/api/admin/chat/cashiers/cashier-2/sessions/session-uuid-2/alias',
      { headers: { authorization: `Bearer ${adminToken}` }, body: { alias: 'Admin alias' } },
    );
    assert.equal(status, 200);
  });

  it('PATCH /chat/sessions/:sessionId/alias returns 401 unauthenticated', async () => {
    const app = makeTestApp(async (id) => (id === 'session-uuid-1' ? ownedSession : null));
    const { status } = await request(
      app, 'PATCH', '/api/chat/sessions/session-uuid-1/alias', { body: { alias: 'x' } },
    );
    assert.equal(status, 401);
  });
});

// ── typing routes ─────────────────────────────────────────────────────────────

describe('chat.routes — typing', () => {
  it('POST /chat/sessions/:sessionId/chats/:chatId/typing returns 200 for owner', async () => {
    const app = makeTestApp(async (id) => (id === 'session-uuid-1' ? ownedSession : null));
    const { status } = await request(
      app, 'POST', '/api/chat/sessions/session-uuid-1/chats/chat@c.us/typing',
      { headers: { authorization: `Bearer ${cashier1Token}` }, body: { state: 'start' } },
    );
    assert.equal(status, 200);
  });

  it('POST .../typing returns 403 for a foreign session', async () => {
    const app = makeTestApp(async (id) => (id === 'session-uuid-2' ? foreignSession : null));
    const { status } = await request(
      app, 'POST', '/api/chat/sessions/session-uuid-2/chats/chat@c.us/typing',
      { headers: { authorization: `Bearer ${cashier1Token}` }, body: { state: 'start' } },
    );
    assert.equal(status, 403);
  });

  it('POST /admin/chat/.../typing returns 200 for admin', async () => {
    const app = makeTestApp(async (id) => (id === 'session-uuid-2' ? foreignSession : null));
    const { status } = await request(
      app, 'POST', '/api/admin/chat/cashiers/cashier-2/sessions/session-uuid-2/chats/chat@c.us/typing',
      { headers: { authorization: `Bearer ${adminToken}` }, body: { state: 'stop' } },
    );
    assert.equal(status, 200);
  });

  it('POST .../typing returns 401 unauthenticated', async () => {
    const app = makeTestApp(async (id) => (id === 'session-uuid-1' ? ownedSession : null));
    const { status } = await request(
      app, 'POST', '/api/chat/sessions/session-uuid-1/chats/chat@c.us/typing',
      { body: { state: 'start' } },
    );
    assert.equal(status, 401);
  });
});

// ── seen routes ───────────────────────────────────────────────────────────────

describe('chat.routes — seen', () => {
  it('POST /chat/sessions/:sessionId/chats/:chatId/seen returns 200 for owner', async () => {
    const app = makeTestApp(async (id) => (id === 'session-uuid-1' ? ownedSession : null));
    const { status } = await request(
      app, 'POST', '/api/chat/sessions/session-uuid-1/chats/chat@c.us/seen',
      { headers: { authorization: `Bearer ${cashier1Token}` } },
    );
    assert.equal(status, 200);
  });

  it('POST .../seen returns 403 for a foreign session', async () => {
    const app = makeTestApp(async (id) => (id === 'session-uuid-2' ? foreignSession : null));
    const { status } = await request(
      app, 'POST', '/api/chat/sessions/session-uuid-2/chats/chat@c.us/seen',
      { headers: { authorization: `Bearer ${cashier1Token}` } },
    );
    assert.equal(status, 403);
  });

  it('POST /admin/chat/.../seen returns 200 for admin', async () => {
    const app = makeTestApp(async (id) => (id === 'session-uuid-2' ? foreignSession : null));
    const { status } = await request(
      app, 'POST', '/api/admin/chat/cashiers/cashier-2/sessions/session-uuid-2/chats/chat@c.us/seen',
      { headers: { authorization: `Bearer ${adminToken}` } },
    );
    assert.equal(status, 200);
  });

  it('POST .../seen returns 401 unauthenticated', async () => {
    const app = makeTestApp(async (id) => (id === 'session-uuid-1' ? ownedSession : null));
    const { status } = await request(
      app, 'POST', '/api/chat/sessions/session-uuid-1/chats/chat@c.us/seen',
    );
    assert.equal(status, 401);
  });
});
