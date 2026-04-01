import type { Job } from 'bullmq';

import { logger } from '../core/logger.js';
import { config } from '../core/config.js';
import { claimMessageProcessing } from '../domain/message/idempotency.repository.js';
import { inboundJobSchema } from '../domain/message/schemas.js';
import { resolveRule } from '../domain/rules/router.js';
import { executeToolCall } from '../domain/tooling/executor.service.js';
import { GptNanoMessageParser } from '../integrations/ai/intent-parser.client.js';
import {
  executeResponseFlow,
  getChatMessages,
  getRandomTypingTime,
  sendList,
  sendSeen,
  sendStartTyping,
  sendStopTyping,
  sendText,
} from '../integrations/waha/waha.client.js';

type ChatContextMessage = {
  id: string;
  timestamp: number;
  fromMe: boolean;
  body: string;
};

async function loadChatHistory(
  session: string,
  chatId: string,
  currentMessageId: string,
) {
  try {
    const messages = await getChatMessages(session, chatId, {
      limit: config.chatContextLimit,
      sortBy: 'timestamp',
      downloadMedia: false,
    });

    return messages
      .filter((message) => Boolean(message.body?.trim()))
      .filter((message) => message.id !== currentMessageId)
      .sort((a, b) => a.timestamp - b.timestamp);
  } catch (error) {
    logger.warn(
      {
        err: error,
        session,
        chatId,
        messageId: currentMessageId,
      },
      'Could not load chat history, using current message only',
    );

    return [] as ChatContextMessage[];
  }
}

const messageParser = new GptNanoMessageParser();

export async function processInboundJob(job: Job) {
  const parsed = inboundJobSchema.safeParse(job.data);

  if (!parsed.success) {
    logger.warn(
      { jobId: job.id, issues: parsed.error.issues },
      'Invalid inbound job payload',
    );
    return;
  }

  const data = parsed.data;

  await sendSeen(data.session, data.payload.from, data.payload.id);
  await sendStartTyping(data.session, data.payload.from);
  setTimeout(async () => {
    await sendStopTyping(data.session, data.payload.from);
    await sendList(data.session, data.payload.from);
  }, getRandomTypingTime());
  /*
  const claimed = await claimMessageProcessing({
    session: data.session,
    chatId: data.payload.from,
    messageId: data.payload.id,
    jobId: job.id,
  });

  if (!claimed) {
    logger.info(
      {
        jobId: job.id,
        messageId: data.payload.id,
        chatId: data.payload.from,
      },
      'Skipping duplicated message',
    );
    return;
  }

  const logContext = {
    jobId: job.id,
    session: data.session,
    chatId: data.payload.from,
    messageId: data.payload.id,
  };

  try {
    await loadChatHistory(
      data.session,
      data.payload.from,
      data.payload.id,
    );

    const parsedMessage = await messageParser.parse(data.payload.body);
    const resolution = resolveRule(parsedMessage);

    if (resolution.toolName) {
      const toolResult = await executeToolCall(
        {
          job,
          session: data.session,
          chatId: data.payload.from,
          messageId: data.payload.id,
        },
        resolution.toolName,
        resolution.args,
      );

      if (toolResult.clientMessage) {
        await executeResponseFlow(
          data.session,
          data.payload.from,
          data.payload.id,
          toolResult.clientMessage,
        );
      }
    } else {
      const fallbackText =
        resolution.fallbackMessage;

      if (!fallbackText) {
        logger.warn({ ...logContext }, 'Rule resolved without tool and fallback message');
        return;
      }

      await executeResponseFlow(
        data.session,
        data.payload.from,
        data.payload.id,
        fallbackText,
      );
    }

    logger.info(logContext, 'Job processed successfully');
  } catch (error) {
    logger.error({ err: error, ...logContext }, 'Job processing failed');
    throw error;
  }
    */
}
