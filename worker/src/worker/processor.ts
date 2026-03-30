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
import { executeResponseFlow } from '../integrations/waha/waha.client.js';

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
    const aiResponse = await generateAiResponse(data.payload.body);
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
          data.payload.body,
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
