import { prisma } from '../../core/prisma.js';

export type AuditStatus = 'success' | 'failed' | 'rejected';

type RecordAuditInput = {
  jobId?: string;
  session: string;
  chatId: string;
  messageId: string;
  toolName: string;
  argumentsJson: unknown;
  status: AuditStatus;
  errorCode?: string;
  durationMs: number;
};

export async function recordFunctionCallAudit(input: RecordAuditInput) {
  await prisma.functionCallAudit.create({
    data: {
      jobId: input.jobId,
      session: input.session,
      chatId: input.chatId,
      messageId: input.messageId,
      toolName: input.toolName,
      argumentsJson: input.argumentsJson as object,
      status: input.status,
      errorCode: input.errorCode,
      durationMs: Math.max(0, Math.round(input.durationMs)),
    },
  });
}
