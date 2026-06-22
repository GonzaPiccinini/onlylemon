import { config } from '../../config/env.js';

export type WahaMessage = {
  id: string;
  timestamp?: number;
  from?: string;
  fromMe?: boolean;
  body: string;
  hasMedia?: boolean;
  media?: {
    url: string;
    mimetype: string;
    s3?: { Bucket: string; Key: string };
  };
};

/**
 * A single chat list entry returned by GET /api/{session}/chats.
 * WAHA Plus 2026.3.4 GOWS only returns these three fields — no lastMessage,
 * unreadCount, or isGroup are present in this version.
 */
export type ChatListEntry = {
  id: string;
  name: string | null;
  conversationTimestamp: number;
};

type WahaSession = {
  name: string;
  status: string;
};

type WahaRequestCodeResponse = {
  code?: string;
  pairingCode?: string;
};

type WahaQrResponse = {
  qr?: string;
  value?: string;
  data?: string;
};

export type GetChatMessagesOptions = {
  limit: number;
  offset?: number;
  sortBy?: 'timestamp' | 'messageTimestamp';
  sortOrder?: 'asc' | 'desc';
  downloadMedia?: boolean;
};

export type SessionsList = {
  name: string;
  status: string;
  config: {
    proxy: string | null;
    webhooks: {
      url: string;
      events: string[];
      hmac: string | null;
      retries: string | number | null;
      customHeaders: Record<string, string> | null;
    }[];
    debug: boolean;
  };
  /** me is null/undefined when the session hasn't connected yet */
  me: {
    id?: string;
    pushname?: string;
  } | null;
  engine: {
    engine: string;
  };
}[];

export type NumberLidMap = {
  lid: string;
  pn: string;
};

export interface Preview {
  title: string;
  description: string;
  url: string;
  image: {
    url: string;
  };
}

export interface List {
  title: string;
  description: string;
  footer?: string;
  button: string;
  sections: {
    title: string;
    rows: { title: string; rowId: string; description?: string }[];
  }[];
}

export async function wahaCall(path: string, payload: Record<string, unknown>) {
  const response = await fetch(`${config.WAHA_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.WAHA_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  return response.ok;
}

async function wahaPostRaw(path: string, payload: Record<string, unknown>) {
  return fetch(`${config.WAHA_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.WAHA_API_KEY,
    },
    body: JSON.stringify(payload),
  });
}

async function wahaCallJson<T>(path: string, payload: Record<string, unknown>) {
  const response = await fetch(`${config.WAHA_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.WAHA_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`WAHA request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

async function wahaGet<T>(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  const response = await fetch(
    `${config.WAHA_BASE_URL}${path}?${query.toString()}`,
    {
      method: 'GET',
      headers: {
        'X-Api-Key': config.WAHA_API_KEY,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`WAHA request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

async function wahaGetRaw(path: string): Promise<Response> {
  return fetch(`${config.WAHA_BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      'X-Api-Key': config.WAHA_API_KEY,
    },
  });
}

async function wahaDelete(path: string): Promise<void> {
  const response = await fetch(`${config.WAHA_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: {
      'X-Api-Key': config.WAHA_API_KEY,
    },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`WAHA request failed with status ${response.status}`);
  }
}

export async function getChatMessages(
  session: string,
  chatId: string,
  options: GetChatMessagesOptions,
) {
  // chatId is cashier-controlled — encode it so a `/` or `..` cannot escape the
  // session scope in the WAHA URL path (IDOR hardening).
  return wahaGet<WahaMessage[]>(`/api/${session}/chats/${encodeURIComponent(chatId)}/messages`, {
    limit: options.limit.toString(),
    sortBy: options.sortBy ?? 'timestamp',
    sortOrder: options.sortOrder ?? 'desc',
    downloadMedia: String(options.downloadMedia ?? false),
    ...(options.offset !== undefined ? { offset: String(options.offset) } : {}),
  });
}

/**
 * Fetches a SINGLE message by id via GET
 * /api/{session}/chats/{chatId}/messages/{messageId}.
 *
 * Returns null when WAHA responds 404 (message not found). With
 * `downloadMedia: true`, WAHA populates `media.url` on demand even for older
 * messages — this is what lets media resolve regardless of how far back the
 * message is (the previous list-scan approach missed anything beyond its limit).
 */
export async function getMessageById(
  session: string,
  chatId: string,
  messageId: string,
  options: { downloadMedia?: boolean } = {},
): Promise<WahaMessage | null> {
  const query = new URLSearchParams({
    downloadMedia: String(options.downloadMedia ?? true),
  });
  // chatId/messageId are cashier-controlled — encode them so a `/` or `..`
  // cannot escape the session scope in the WAHA URL path (IDOR hardening).
  const response = await wahaGetRaw(
    `/api/${session}/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}?${query.toString()}`,
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`WAHA getMessageById failed with status ${response.status}`);
  }

  return (await response.json()) as WahaMessage;
}

export async function getSessions() {
  return wahaGet<SessionsList>('/api/sessions', {});
}

export async function getSession(
  sessionName: string,
): Promise<WahaSession | null> {
  const sessions = await getSessions();
  return sessions.find((session) => session.name === sessionName) ?? null;
}

export async function createSessionIfNotExists(
  sessionName: string,
): Promise<void> {
  const existing = await getSession(sessionName);
  if (existing) {
    return;
  }

  const configuredEvents = config.WAHA_WEBHOOK_EVENTS.split(',')
    .map((event) => event.trim())
    .filter(Boolean);
  const events = Array.from(
    new Set([...configuredEvents, 'message.any', 'message.reaction', 'session.status']),
  );

  await wahaCallJson('/api/sessions', {
    name: sessionName,
    config: {
      debug: false,
      ignore: {
        status: true,
        groups: true,
        channels: true,
        broadcast: true,
      },
      gows: {
        storage: {
          // GOWS must persist messages and chats so the auto-conversion OCR
          // flow can walk back through chat history via getChatMessages and
          // find the most recent receipt image. Groups and labels are not
          // needed by any worker flow.
          messages: true,
          chats: true,
          groups: false,
          labels: false,
        },
      },
      webhooks: [
        {
          url: config.WAHA_WEBHOOK_URL,
          events,
          hmac: null,
          customHeaders: [
            {
              name: config.WAHA_WEBHOOK_TOKEN_HEADER,
              value: config.WAHA_WEBHOOK_TOKEN_VALUE,
            },
          ],
          retries: {
            policy: 'exponential',
            delaySeconds: 2,
            attempts: 15,
          },
        },
      ],
    },
  });
}

export async function startSession(sessionName: string): Promise<void> {
  const response = await wahaPostRaw(`/api/sessions/${sessionName}/start`, {});
  if (response.ok) {
    return;
  }

  const body = await response.text();
  const bodyText = body.toLowerCase();
  if (
    response.status === 409 ||
    response.status === 422 ||
    bodyText.includes('already') ||
    bodyText.includes('starting') ||
    bodyText.includes('working')
  ) {
    return;
  }

  throw new Error(`WAHA_START_FAILED:${response.status}`);
}

export async function requestSessionCode(
  sessionName: string,
  phoneNumber: string,
): Promise<string | null> {
  const data = await wahaCallJson<WahaRequestCodeResponse>(
    `/api/${sessionName}/auth/request-code`,
    { phoneNumber },
  );

  return data.pairingCode ?? data.code ?? null;
}

export async function getSessionQr(
  sessionName: string,
): Promise<string | null> {
  const response = await fetch(
    `${config.WAHA_BASE_URL}/api/${sessionName}/auth/qr`,
    {
      method: 'GET',
      headers: {
        'X-Api-Key': config.WAHA_API_KEY,
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    if (response.status === 405) {
      const fallback = await wahaCallJson<WahaQrResponse>(
        `/api/${sessionName}/auth/qr`,
        {},
      );
      return fallback.qr ?? fallback.value ?? fallback.data ?? null;
    }

    throw new Error(`WAHA request failed with status ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await response.json()) as WahaQrResponse;
    return body.qr ?? body.value ?? body.data ?? null;
  }

  const binaryResponse = await wahaGetRaw(`/api/${sessionName}/auth/qr`);
  if (binaryResponse.ok) {
    const bytes = await binaryResponse.arrayBuffer();
    return Buffer.from(bytes).toString('base64');
  }

  const rawResponse = await wahaGetRaw(
    `/api/${sessionName}/auth/qr?format=raw`,
  );
  if (rawResponse.ok) {
    return await rawResponse.text();
  }

  return null;
}

export async function getNumberByLid(session: string, chatId: string) {
  return wahaGet<NumberLidMap>(`/api/${session}/lids/${chatId}`, {});
}

export async function deleteSession(sessionName: string): Promise<void> {
  await wahaDelete(`/api/sessions/${sessionName}`);
}

/**
 * Lists all chats for a session.
 * Calls GET /api/{session}/chats and returns an array of ChatListEntry.
 * WAHA Plus 2026.3.4 only returns {id, name, conversationTimestamp} per entry.
 */
export type ListChatsOptions = {
  limit?: number;
  offset?: number;
};

export async function listChats(
  session: string,
  options: ListChatsOptions = {},
): Promise<ChatListEntry[]> {
  // Sort newest-first at the WAHA layer so offset pagination is stable.
  const params = new URLSearchParams({
    sortBy: 'conversationTimestamp',
    sortOrder: 'desc',
  });
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));

  const response = await fetch(
    `${config.WAHA_BASE_URL}/api/${session}/chats?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        'X-Api-Key': config.WAHA_API_KEY,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`WAHA listChats failed with status ${response.status}`);
  }

  const data = (await response.json()) as Array<{
    id: string;
    name?: string | null;
    conversationTimestamp?: number | null;
  }>;

  return data.map((entry) => ({
    id: entry.id,
    name: entry.name ?? null,
    conversationTimestamp: entry.conversationTimestamp ?? 0,
  }));
}

/**
 * Sends an image to a WhatsApp chat.
 * Calls POST /api/sendImage with base64-encoded file data.
 * `file.data` must be base64-encoded bytes WITHOUT a `data:` prefix.
 * Throws if WAHA responds with non-2xx.
 */
export async function sendImage(
  session: string,
  chatId: string,
  file: { data: string; mimetype: string },
  caption?: string,
): Promise<void> {
  const payload: Record<string, unknown> = {
    session,
    chatId,
    file: { data: file.data, mimetype: file.mimetype },
  };

  if (caption !== undefined) {
    payload.caption = caption;
  }

  const response = await fetch(`${config.WAHA_BASE_URL}/api/sendImage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.WAHA_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`WAHA sendImage failed with status ${response.status}`);
  }
}

/**
 * Publishes a text status (story). Calls POST /api/{session}/status/text.
 * `backgroundColor` is a hex color (e.g. "#38b42f"); `font` is a WAHA font index.
 * Throws if WAHA responds with non-2xx.
 */
export async function sendTextStatus(
  session: string,
  payload: { text: string; backgroundColor?: string; font?: number },
): Promise<void> {
  const body: Record<string, unknown> = { text: payload.text };
  if (payload.backgroundColor !== undefined) body.backgroundColor = payload.backgroundColor;
  if (payload.font !== undefined) body.font = payload.font;

  const response = await fetch(`${config.WAHA_BASE_URL}/api/${session}/status/text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.WAHA_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`WAHA sendTextStatus failed with status ${response.status}`);
  }
}

/**
 * Publishes an image status (story). Calls POST /api/{session}/status/image.
 * `file.data` is base64-encoded image content.
 * Throws if WAHA responds with non-2xx.
 */
export async function sendImageStatus(
  session: string,
  payload: { file: { data: string; mimetype: string }; caption?: string },
): Promise<void> {
  const body: Record<string, unknown> = {
    file: { data: payload.file.data, mimetype: payload.file.mimetype },
  };
  if (payload.caption !== undefined) body.caption = payload.caption;

  const response = await fetch(`${config.WAHA_BASE_URL}/api/${session}/status/image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.WAHA_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`WAHA sendImageStatus failed with status ${response.status}`);
  }
}

/**
 * Sends or removes a reaction on a WhatsApp message.
 * Calls PUT /api/reaction (WAHA uses PUT, not POST — confirmed Batch 0).
 * `reaction` is the emoji string; pass `""` to remove the reaction.
 * `messageId` is the full serialized WhatsApp message ID (e.g. "false_{chatId}_{id}").
 * Throws if WAHA responds with non-2xx.
 */
export async function sendReaction(
  session: string,
  messageId: string,
  reaction: string,
): Promise<void> {
  const response = await fetch(`${config.WAHA_BASE_URL}/api/reaction`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.WAHA_API_KEY,
    },
    body: JSON.stringify({ session, messageId, reaction }),
  });

  if (!response.ok) {
    throw new Error(`WAHA sendReaction failed with status ${response.status}`);
  }
}

export async function sendText(
  session: string,
  chatId: string,
  text: string,
  replyTo?: string,
): Promise<void> {
  const payload: Record<string, unknown> = { session, chatId, text };
  if (replyTo !== undefined) {
    payload.reply_to = replyTo;
  }

  const response = await fetch(`${config.WAHA_BASE_URL}/api/sendText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.WAHA_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`WAHA sendText failed with status ${response.status}`);
  }
}

/**
 * Returns the cashier's own WhatsApp JID (`me.id`) for the given session.
 * Returns null if the session is not found or hasn't connected (me is null/undefined).
 *
 * Used by auto-conversion/service.ts (Item #2) to direct error replies to the
 * cashier's own chat instead of the client's chat.
 */
export async function getOwnChatId(sessionName: string): Promise<string | null> {
  const sessions = await getSessions();
  const session = sessions.find((s) => s.name === sessionName);
  return session?.me?.id ?? null;
}

/**
 * Updates an existing WAHA session's config via PUT /api/sessions/{name}.
 * Used by the boot-time fixup to add missing webhook events (e.g. message.reaction)
 * to sessions that were created before that event was included in the default set.
 *
 * The request body is wrapped as `{ config }` per WAHA Plus 2026.3.4 API.
 * Throws on any non-2xx response.
 *
 * NOTE: The exact PUT /api/sessions/{name} shape was not live-verified in Batch 0
 * (the session in the smoke test had config.webhooks = []). This should be
 * smoke-verified in Batch 14 manual QA against a real session.
 */
export async function updateSessionConfig(
  sessionName: string,
  sessionConfig: object,
): Promise<void> {
  const response = await fetch(`${config.WAHA_BASE_URL}/api/sessions/${sessionName}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.WAHA_API_KEY,
    },
    body: JSON.stringify({ config: sessionConfig }),
  });

  if (!response.ok) {
    throw new Error(`WAHA updateSessionConfig failed with status ${response.status}`);
  }
}

export async function downloadMedia(
  url: string,
): Promise<{ buffer: Buffer; mimetype: string }> {
  // WAHA Plus with S3 proxy returns media URLs pointing at whatever address
  // WAHA advertises for itself (`localhost:3000` locally, its public domain in
  // prod) — which the worker container can't always reach. Rewrite the origin to
  // the WAHA base URL the worker is actually configured to use, regardless of host.
  let rewritten = url;
  try {
    const target = new URL(url);
    const base = new URL(config.WAHA_BASE_URL);
    target.protocol = base.protocol;
    target.host = base.host;
    rewritten = target.toString();
  } catch {
    rewritten = url; // si no parsea, dejamos la original
  }
  const response = await fetch(rewritten, {
    method: 'GET',
    headers: {
      'X-Api-Key': config.WAHA_API_KEY,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `WAHA downloadMedia failed: status=${response.status} url=${rewritten} body=${body.slice(0, 300)}`,
    );
  }

  const mimetype = response.headers.get('content-type') ?? 'application/octet-stream';
  const bytes = await response.arrayBuffer();
  return { buffer: Buffer.from(bytes), mimetype };
}
