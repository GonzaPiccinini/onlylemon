import type { Job } from 'bullmq';

import { DOMAIN_RULES } from '../../constants/domain-rules.js';
import {
  CREATE_USER_SUCCESS_MESSAGE,
  DEPOSIT_SUCCESS_MESSAGE,
  DEPOSIT_UNKNOWN_MESSAGE,
  FALLBACK_DEPOSIT_USER_REQUIRED_MESSAGE,
  FALLBACK_OPERATION_REJECTED_MESSAGE,
} from '../../constants/messages.js';
import { applyTemplate } from '../../core/template.js';
import { logger } from '../../core/logger.js';
import { CargaSaldo } from '../core/carga-saldo.js';
import { Estado } from '../core/estado.js';
import { Usuario } from '../core/usuario.js';
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
      try {
        const usuario = Usuario.crear(name);
        await createUser({ name: usuario.getNombre() });
        await upsertChatUser({ chatId: context.chatId, username: usuario.getNombre() });

        return {
          clientMessage: applyTemplate(CREATE_USER_SUCCESS_MESSAGE, {
            name: usuario.getNombre(),
          }),
        };
      } catch {
        return { clientMessage: FALLBACK_OPERATION_REJECTED_MESSAGE };
      }
    }

    const amount = typeof args.amount === 'number' ? Math.trunc(args.amount) : NaN;
    const isInvalidAmount =
      !Number.isFinite(amount) ||
      amount < DOMAIN_RULES.depositAmount.min ||
      amount > DOMAIN_RULES.depositAmount.max;
    if (isInvalidAmount) {
      return { clientMessage: FALLBACK_OPERATION_REJECTED_MESSAGE };
    }

    const chatUser = await findChatUserByChatId(context.chatId);
    if (!chatUser) {
      return {
        clientMessage: FALLBACK_DEPOSIT_USER_REQUIRED_MESSAGE,
      };
    }

    const cargaSaldo = CargaSaldo.crear(amount, context.messageId);

    try {
      await depositMoney({ name: chatUser.username, amount });
      cargaSaldo.setEstado(Estado.completada());
      await createChatTransaction({
        chatId: context.chatId,
        type: 'deposit',
        amount: cargaSaldo.getMonto(),
        status: 'success',
      });

      return { clientMessage: DEPOSIT_SUCCESS_MESSAGE };
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'ambiguous') {
        cargaSaldo.setEstado(Estado.pendiente());
        await createChatTransaction({
          chatId: context.chatId,
          type: 'deposit',
          amount: cargaSaldo.getMonto(),
          status: 'unknown',
          errorCode: error.code,
        });

        return { clientMessage: DEPOSIT_UNKNOWN_MESSAGE };
      }

      if (error instanceof ApiError) {
        cargaSaldo.setEstado(Estado.cancelada());
        await createChatTransaction({
          chatId: context.chatId,
          type: 'deposit',
          amount: cargaSaldo.getMonto(),
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
