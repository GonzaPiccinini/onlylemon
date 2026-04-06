import {
  List,
  Preview,
  sendLinkPreview,
  sendList,
  sendSeen,
  sendStartTyping,
  sendStopTyping,
  sendText,
} from './client.js';

function getRandomTypingTime() {
  const minCeiled = Math.ceil(0.3);
  const maxFloored = Math.floor(1.5);
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

export async function executeSendTextFlow(
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

export async function executeSendLinkPreviewFlow(
  session: string,
  chatId: string,
  messageId: string,
  text: string,
  preview: Preview,
) {
  await sendSeen(session, chatId, messageId);
  await sendStartTyping(session, chatId);
  await wait(getRandomTypingTime());
  await sendStopTyping(session, chatId);
  await sendLinkPreview(session, chatId, text, preview);
}

export async function exectuteSendListFlow(
  session: string,
  chatId: string,
  list: List,
) {
  await sendStartTyping(session, chatId);
  await wait(getRandomTypingTime());
  await sendStopTyping(session, chatId);
  await sendList(session, chatId, list);
}
