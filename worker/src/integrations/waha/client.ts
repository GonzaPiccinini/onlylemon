import { config } from '../../config/env.js';

type WahaMessage = {
  id: string;
  timestamp: number;
  fromMe: boolean;
  body: string;
};

export type GetChatMessagesOptions = {
  limit: number;
  sortBy?: 'timestamp' | 'messageTimestamp';
  downloadMedia?: boolean;
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

async function wahaCall(path: string, payload: Record<string, unknown>) {
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

export async function sendSeen(
  session: string,
  chatId: string,
  messageId: string,
) {
  await wahaCall('/api/sendSeen', {
    chatId,
    session,
    messageIds: [messageId],
    participant: null,
  });
}

export async function sendStartTyping(session: string, chatId: string) {
  await wahaCall('/api/startTyping', {
    chatId,
    session,
  });
}

export async function sendStopTyping(session: string, chatId: string) {
  await wahaCall('/api/stopTyping', {
    chatId,
    session,
  });
}

export async function sendText(session: string, chatId: string, text: string) {
  await wahaCall('/api/sendText', {
    chatId,
    session,
    text,
    reply_to: null,
    linkPreview: true,
    linkPreviewHighQuality: false,
  });
}

export async function sendLinkPreview(
  session: string,
  chatId: string,
  text: string,
  preview: Preview,
) {
  await wahaCall('/api/send/link-custom-preview', {
    session,
    chatId,
    linkPreviewHighQuality: true,
    replyTo: null,
    text,
    preview,
  });
}

export async function sendList(session: string, chatId: string, list: List) {
  await wahaCall('/api/sendList', {
    session,
    chatId,
    replyTo: null,
    message: list,
  });
}
