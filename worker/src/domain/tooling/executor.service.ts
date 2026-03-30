import type { Job } from 'bullmq';

import { DEPOSIT_UNKNOWN_MESSAGE } from '../../constants/messages.js';
import { logger } from '../../core/logger.js';
import {
  operationsUnknownTotal,
  toolCallsTotal,
  toolDurationSeconds,
} from '../../core/metrics.js';
import {
  ApiError,
  createUser,
  depositMoney,
} from '../../integrations/external-api/external-api.client.js';
import { createUserArgsSchema, depositMoneyArgsSchema } from './schemas.js';
import { recordFunctionCallAudit } from './audit.repository.js';
import { recordDepositOperationState } from './operation-state.repository.js';
import type { ToolName } from './declarations.js';

type ToolDispatchContext = {
  job: Job;
  session: string;
  chatId: string;
  messageId: string;
};

type ToolDispatchResult = {
  clientMessage?: string;
};

export async function executeToolCall(
  context: ToolDispatchContext,
  toolName: ToolName,
  args: Record<string, unknown>,
): Promise<ToolDispatchResult> {
  const endTool = toolDurationSeconds.startTimer({ tool: toolName });
  const startedAt = Date.now();

  try {
    if (toolName === 'create_user') {
      const parsed = createUserArgsSchema.safeParse(args);
      if (!parsed.success) {
        toolCallsTotal.inc({ tool: toolName, status: 'rejected' });
        await recordFunctionCallAudit({
          jobId: context.job.id,
          session: context.session,
          chatId: context.chatId,
          messageId: context.messageId,
          toolName,
          argumentsJson: args,
          status: 'rejected',
          errorCode: 'INVALID_ARGUMENTS',
          durationMs: Date.now() - startedAt,
        });
        return { clientMessage: 'Could not process this request right now.' };
      }

      await createUser(parsed.data);
      toolCallsTotal.inc({ tool: toolName, status: 'success' });
      await recordFunctionCallAudit({
        jobId: context.job.id,
        session: context.session,
        chatId: context.chatId,
        messageId: context.messageId,
        toolName,
        argumentsJson: parsed.data,
        status: 'success',
        durationMs: Date.now() - startedAt,
      });

      return {
        clientMessage: `User ${parsed.data.name} created successfully.`,
      };
    }

    const parsed = depositMoneyArgsSchema.safeParse(args);
    if (!parsed.success) {
      toolCallsTotal.inc({ tool: toolName, status: 'rejected' });
      await recordFunctionCallAudit({
        jobId: context.job.id,
        session: context.session,
        chatId: context.chatId,
        messageId: context.messageId,
        toolName,
        argumentsJson: args,
        status: 'rejected',
        errorCode: 'INVALID_ARGUMENTS',
        durationMs: Date.now() - startedAt,
      });
      await recordDepositOperationState({
        jobId: context.job.id,
        messageId: context.messageId,
        status: 'failed',
        reason: 'INVALID_ARGUMENTS',
      });
      return { clientMessage: 'Could not process deposit with those values.' };
    }

    try {
      await depositMoney(parsed.data);
      toolCallsTotal.inc({ tool: toolName, status: 'success' });
      await recordFunctionCallAudit({
        jobId: context.job.id,
        session: context.session,
        chatId: context.chatId,
        messageId: context.messageId,
        toolName,
        argumentsJson: parsed.data,
        status: 'success',
        durationMs: Date.now() - startedAt,
      });
      await recordDepositOperationState({
        jobId: context.job.id,
        messageId: context.messageId,
        status: 'success',
      });

      return { clientMessage: 'Deposit completed successfully.' };
    } catch (error) {
      // Without external idempotency or operation references, ambiguous failures
      // must be treated as unknown and should not be auto-retried.
      if (error instanceof ApiError && error.kind === 'ambiguous') {
        toolCallsTotal.inc({ tool: toolName, status: 'unknown' });
        operationsUnknownTotal.inc({ operation: 'deposit_money' });
        await recordFunctionCallAudit({
          jobId: context.job.id,
          session: context.session,
          chatId: context.chatId,
          messageId: context.messageId,
          toolName,
          argumentsJson: parsed.data,
          status: 'failed',
          errorCode: error.code,
          durationMs: Date.now() - startedAt,
        });
        await recordDepositOperationState({
          jobId: context.job.id,
          messageId: context.messageId,
          status: 'unknown',
          reason: error.code,
        });

        return { clientMessage: DEPOSIT_UNKNOWN_MESSAGE };
      }

      throw error;
    }
  } catch (error) {
    logger.error(
      {
        err: error,
        jobId: context.job.id,
        messageId: context.messageId,
        tool: toolName,
      },
      'Tool execution failed',
    );

    toolCallsTotal.inc({ tool: toolName, status: 'error' });
    await recordFunctionCallAudit({
      jobId: context.job.id,
      session: context.session,
      chatId: context.chatId,
      messageId: context.messageId,
      toolName,
      argumentsJson: args,
      status: 'failed',
      errorCode: 'TOOL_EXECUTION_FAILED',
      durationMs: Date.now() - startedAt,
    });

    throw error;
  } finally {
    endTool();
  }
}
