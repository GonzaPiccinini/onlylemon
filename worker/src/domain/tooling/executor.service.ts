import type { Job } from 'bullmq';

import { DEPOSIT_UNKNOWN_MESSAGE } from '../../constants/messages.js';
import { logger } from '../../core/logger.js';
import {
  ApiError,
  createUser,
  depositMoney,
} from '../../integrations/external-api/external-api.client.js';
import {
  findChatUserByChatId,
  upsertChatUser,
} from '../message/chat-user.repository.js';
import { createChatTransaction } from '../message/chat-transaction.repository.js';

type ToolName = 'create_user' | 'deposit_money';

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
  try {
    if (toolName === 'create_user') {
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      if (!name || name.length > 120) {
        return { clientMessage: 'Could not process this request right now.' };
      }

      await createUser({ name });
      await upsertChatUser({ chatId: context.chatId, username: name });

      return {
        clientMessage: `User ${name} created successfully.`,
      };
    }

    const amount = typeof args.amount === 'number' ? Math.trunc(args.amount) : NaN;
    if (!Number.isFinite(amount) || amount < 2000 || amount > 1_000_000_000) {
      return { clientMessage: 'Could not process deposit with those values.' };
    }

    const chatUser = await findChatUserByChatId(context.chatId);
    if (!chatUser) {
      return {
        clientMessage: 'Before depositing, please create your user and share your name.',
      };
    }

    try {
      await depositMoney({ name: chatUser.username, amount });
      await createChatTransaction({
        chatId: context.chatId,
        type: 'deposit',
        amount,
        status: 'success',
      });

      return { clientMessage: 'Deposit completed successfully.' };
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'ambiguous') {
        await createChatTransaction({
          chatId: context.chatId,
          type: 'deposit',
          amount,
          status: 'unknown',
          errorCode: error.code,
        });

        return { clientMessage: DEPOSIT_UNKNOWN_MESSAGE };
      }

      if (error instanceof ApiError) {
        await createChatTransaction({
          chatId: context.chatId,
          type: 'deposit',
          amount,
          status: 'failed',
          errorCode: error.code,
        });
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

    throw error;
  }
}
