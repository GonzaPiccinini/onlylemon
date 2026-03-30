import { config } from '../../core/config.js';

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

function getRandomTypingTime() {
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
