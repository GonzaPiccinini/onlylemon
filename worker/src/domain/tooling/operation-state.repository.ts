import { OperationType } from '../../../generated/prisma/enums.js';
import { prisma } from '../../core/prisma.js';

type OperationStateInput = {
  jobId?: string;
  messageId: string;
  status: 'success' | 'failed' | 'unknown';
  reason?: string;
};

export async function recordDepositOperationState(input: OperationStateInput) {
  await prisma.operationState.create({
    data: {
      jobId: input.jobId,
      messageId: input.messageId,
      operationType: OperationType.deposit_money,
      status: input.status,
      reason: input.reason,
    },
  });
}
