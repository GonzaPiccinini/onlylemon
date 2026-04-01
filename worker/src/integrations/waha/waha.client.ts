import { config } from '../../core/config.js';

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
  const response = await fetch(`${config.wahaBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.wahaApiKey,
    },
    body: JSON.stringify(payload),
  });

  return response.ok;
}

async function wahaGet<T>(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  const response = await fetch(
    `${config.wahaBaseUrl}${path}?${query.toString()}`,
    {
      method: 'GET',
      headers: {
        'X-Api-Key': config.wahaApiKey,
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

export async function sendList(session: string, chatId: string) {
  await wahaCall('/api/sendList', {
    chatId,
    session,
    reply_to: null,
    message: {
      title: '¡Hola, bienvenido a Lemonbet 🍋!',
      description: '¿En qué te puedo ayudar?',
      button: 'Abrir menú de opciones',
      sections: [
        {
          title: '¿Qué querés hacer?',
          rows: [
            {
              title: 'Quiero crear un usuario en la plataforma',
              rowId: 'crear_usuario',
              description: null,
            },
            {
              title: 'Quiero cargar saldo (fichas) en mi cuenta de usuario',
              rowId: 'cargar_saldo',
              description: null,
            },
            {
              title: 'Necesito contactar al soporte',
              rowId: 'contactar_soporte',
              description: null,
            },
          ],
        },
      ],
    },
  });
}

export function getRandomTypingTime() {
  const minCeiled = Math.ceil(3);
  const maxFloored = Math.floor(8);
  return Math.floor(Math.random() * (maxFloored - minCeiled + 1) + minCeiled);
}

export async function executeResponseFlow(
  session: string,
  chatId: string,
  messageId: string,
  text: string,
) {
  await sendSeen(session, chatId, messageId);
  await sendStartTyping(session, chatId);
  setTimeout(async () => {
    await sendStopTyping(session, chatId);
    await sendText(session, chatId, text);
  }, getRandomTypingTime());
}
