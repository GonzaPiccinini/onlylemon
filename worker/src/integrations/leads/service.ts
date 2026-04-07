import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { config } from '../../config/env.js';
import { getNumberByLid } from '../waha/client.js';
import {
  getLeadByCode,
  markLeadAsContactedIfPending,
  saveLead,
  updateLead,
} from '../../persistence/repositories/leadsRepository.js';

const CODE_LENGTH = 6;
const MAX_CODE_GENERATION_ATTEMPTS = 5;
const generateCode = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', CODE_LENGTH);

export const CreateLeadPayloadSchema = z.object({
  fbc: z.string().trim().min(1).max(512),
  fbp: z.string().trim().min(1).max(512),
  userAgent: z.string().trim().min(1).max(2048),
});

export type CreateLeadPayload = z.infer<typeof CreateLeadPayloadSchema>;

export type CreateLeadResult = {
  code: string;
  expiresAt: Date;
};

export type LeadMatchResult =
  | 'NO_CODE'
  | 'INVALID_CODE'
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'ALREADY_USED'
  | 'MATCHED'
  | 'PHONE_LOOKUP_FAILED';

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function getExpiresAt(now: Date): Date {
  return new Date(now.getTime() + config.LEADS_CODE_TTL_HOURS * 60 * 60 * 1000);
}

function extractLeadCode(body: string): string | null {
  const match = body.match(/\bCODIGO\s*:\s*([a-z0-9]{6})\b/i);
  if (!match?.[1]) return null;
  return match[1].toLowerCase();
}

export async function createLead(payload: CreateLeadPayload): Promise<CreateLeadResult> {
  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const code = generateCode();
    const expiresAt = getExpiresAt(new Date());

    try {
      const lead = await saveLead({
        ...payload,
        code,
        expiresAt,
      });

      return {
        code: lead.code,
        expiresAt: lead.expiresAt,
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error('Could not generate unique lead code');
}

export async function mapLeadCodeToPhone(
  session: string,
  chatId: string,
  body: string,
): Promise<LeadMatchResult> {
  if (!body.trim()) return 'NO_CODE';

  const code = extractLeadCode(body);
  if (!code) {
    return /CODIGO\s*:/i.test(body) ? 'INVALID_CODE' : 'NO_CODE';
  }

  const lead = await getLeadByCode(code);
  if (!lead) return 'NOT_FOUND';

  if (lead.status !== 'PENDING' || lead.matchedAt) {
    return 'ALREADY_USED';
  }

  const now = new Date();
  if (lead.expiresAt <= now) {
    await updateLead(lead.id, { status: 'EXPIRED' });
    return 'EXPIRED';
  }

  try {
    const { pn } = await getNumberByLid(session, chatId);
    const phone = pn.split('@')[0];

    if (!phone) {
      return 'PHONE_LOOKUP_FAILED';
    }

    const updatedRows = await markLeadAsContactedIfPending(lead.id, phone, now);
    return updatedRows === 1 ? 'MATCHED' : 'ALREADY_USED';
  } catch {
    return 'PHONE_LOOKUP_FAILED';
  }
}
