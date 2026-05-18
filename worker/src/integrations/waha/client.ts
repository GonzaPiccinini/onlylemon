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
  sortBy?: 'timestamp' | 'messageTimestamp';
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
  return wahaGet<WahaMessage[]>(`/api/${session}/chats/${chatId}/messages`, {
    limit: options.limit.toString(),
    sortBy: options.sortBy ?? 'timestamp',
    downloadMedia: String(options.downloadMedia ?? false),
  });
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
    new Set([...configuredEvents, 'message.any', 'session.status']),
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

export async function sendText(
  session: string,
  chatId: string,
  text: string,
): Promise<void> {
  const response = await fetch(`${config.WAHA_BASE_URL}/api/sendText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.WAHA_API_KEY,
    },
    body: JSON.stringify({ session, chatId, text }),
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

export async function downloadMedia(
  url: string,
): Promise<{ buffer: Buffer; mimetype: string }> {
  // WAHA Plus with S3 proxy returns URLs like
  // `http://localhost:3000/api/s3/...` because it advertises its own external
  // address; from inside this container `localhost` doesn't reach WAHA. Rewrite
  // the origin to the configured WAHA base URL when we detect the proxy prefix.
  const rewritten = url.replace(
    /^https?:\/\/(localhost|127\.0\.0\.1):3000/,
    config.WAHA_BASE_URL,
  );
  const response = await fetch(rewritten, {
    method: 'GET',
    headers: {
      'X-Api-Key': config.WAHA_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`WAHA downloadMedia failed with status ${response.status}`);
  }

  const mimetype = response.headers.get('content-type') ?? 'application/octet-stream';
  const bytes = await response.arrayBuffer();
  return { buffer: Buffer.from(bytes), mimetype };
}
