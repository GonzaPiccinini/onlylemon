import { config } from './config.js';

type WahaMessage = {
  id: string;
  timestamp: number;
  fromMe: boolean;
  body: string;
};

type GetChatMessagesOptions = {
  limit: number;
  sortBy?: 'timestamp' | 'messageTimestamp';
  downloadMedia?: boolean;
};

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

interface Contact {
  fullname: string;
  organization: string;
  phoneNumber: string;
  whatsappId: string;
  vcard: null;
}

export async function sendContacts(
  session: string,
  chatId: string,
  contacts: Contact[],
) {
  await wahaCall('/api/sendContactVcard', {
    session,
    chatId,
    contacts,
    replyTo: null,
  });
}

function getRandomTypingTime() {
  const minCeiled = Math.ceil(2);
  const maxFloored = Math.floor(4);
  const seconds = Math.floor(
    Math.random() * (maxFloored - minCeiled + 1) + minCeiled,
  );
  return seconds * 1000;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function executeResponseFlow(
  session: string,
  chatId: string,
  messageId: string,
  text: string,
) {
  await sendSeen(session, chatId, messageId);
  await sendStartTyping(session, chatId);
  await wait(getRandomTypingTime());
  await sendStopTyping(session, chatId);
  await sendText(session, chatId, text);
}

export async function executeResponseContactSupport(
  session: string,
  chatId: string,
  messageId: string,
  contacts: Contact[],
) {
  await sendSeen(session, chatId, messageId);
  await sendStartTyping(session, chatId);
  await wait(getRandomTypingTime());
  await sendStopTyping(session, chatId);
  await sendContacts(session, chatId, contacts);
}
