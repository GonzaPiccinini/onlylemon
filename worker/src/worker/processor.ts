import type { Job } from 'bullmq';

import { logger } from '../core/logger.js';
import {
  jobDurationSeconds,
  jobsFailedTotal,
  jobsProcessedTotal,
} from '../core/metrics.js';
import { claimMessageProcessing } from '../domain/message/idempotency.repository.js';
import { inboundJobSchema } from '../domain/message/schemas.js';
import { recordFunctionCallAudit } from '../domain/tooling/audit.repository.js';
import { executeToolCall } from '../domain/tooling/executor.service.js';
import { generateAiResponse } from '../integrations/ai/gemini.client.js';
import {
  executeResponseFlow,
  getChatMessages,
} from '../integrations/waha/waha.client.js';
import { config } from '../core/config.js';

type ChatContextMessage = {
  id: string;
  timestamp: number;
  fromMe: boolean;
  body: string;
};

function formatHistoryForPrompt(messages: ChatContextMessage[]) {
  return messages
    .map((message) => {
      const role = message.fromMe ? 'Cajero' : 'Usuario';
      return `${role}: ${message.body}`;
    })
    .join('\n');
}

async function buildPromptWithChatContext(
  session: string,
  chatId: string,
  currentMessageId: string,
  currentMessageBody: string,
) {
  try {
    const messages = await getChatMessages(session, chatId, {
      limit: config.ai.contextLimit,
      sortBy: 'timestamp',
      downloadMedia: false,
    });

    const historyMessages = messages
      .filter((message) => Boolean(message.body?.trim()))
      .filter((message) => message.id !== currentMessageId)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (!historyMessages.length) {
      return currentMessageBody;
    }

    const formattedHistory = formatHistoryForPrompt(historyMessages);

    return [
      'Usa el historial para responder con continuidad al usuario.',
      'Historial reciente del chat:',
      formattedHistory,
      'Mensaje actual del usuario:',
      `Usuario: ${currentMessageBody}`,
    ].join('\n\n');
  } catch (error) {
    logger.warn(
      {
        err: error,
        session,
        chatId,
        messageId: currentMessageId,
      },
      'Could not load chat history, using single-message prompt',
    );

    return currentMessageBody;
  }
}

export async function processInboundJob(job: Job) {
  const endJob = jobDurationSeconds.startTimer();
  const parsed = inboundJobSchema.safeParse(job.data);

  if (!parsed.success) {
    jobsFailedTotal.inc({ reason: 'validation_error' });
    logger.warn(
      { jobId: job.id, issues: parsed.error.issues },
      'Invalid inbound job payload',
    );
    return;
  }

  const data = parsed.data;
  const claimed = await claimMessageProcessing({
    session: data.session,
    chatId: data.payload.from,
    messageId: data.payload.id,
    jobId: job.id,
  });

  if (!claimed) {
    jobsProcessedTotal.inc({ result: 'duplicate' });
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
    const prompt = await buildPromptWithChatContext(
      data.session,
      data.payload.from,
      data.payload.id,
      data.payload.body,
    );
    const aiResponse = await generateAiResponse(prompt);
    const firstCall = aiResponse.functionCalls?.[0];

    if (
      firstCall?.name === 'create_user' ||
      firstCall?.name === 'deposit_money'
    ) {
      const toolResult = await executeToolCall(
        {
          job,
          session: data.session,
          chatId: data.payload.from,
          messageId: data.payload.id,
        },
        firstCall.name,
        firstCall.args ?? {},
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
        aiResponse.text ?? 'I do not have a response available right now.';
      await recordFunctionCallAudit({
        jobId: job.id,
        session: data.session,
        chatId: data.payload.from,
        messageId: data.payload.id,
        toolName: 'none',
        argumentsJson: {},
        status: 'success',
        durationMs: 0,
      });
      await executeResponseFlow(
        data.session,
        data.payload.from,
        data.payload.id,
        fallbackText,
      );
    }

    jobsProcessedTotal.inc({ result: 'success' });
    logger.info(logContext, 'Job processed successfully');
  } catch (error) {
    jobsFailedTotal.inc({ reason: 'processing_error' });
    logger.error({ err: error, ...logContext }, 'Job processing failed');
    throw error;
  } finally {
    endJob();
  }
}
