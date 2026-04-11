import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { config } from '../../config/env.js';
import { getNumberByLid } from '../waha/client.js';
import {
  expireLeadIfStillOpen,
  getActiveLandingCashierCandidatesByMetaPixelId,
  getContactedLeadCountByCashierForLanding,
  getLeadByCode,
  markLeadAsContacted,
  saveLead,
} from '../../persistence/repositories/leadsRepository.js';
import { getCashierBySessionName } from '../../modules/cashier/cashier.repository.js';
import { getSessions } from '../waha/client.js';

const CODE_LENGTH = 8;
const MAX_CODE_GENERATION_ATTEMPTS = 5;
const generateCode = customAlphabet(
  'ABCDEFGHIJQLMNOPQRSTUVWXYZ0123456789',
  CODE_LENGTH,
);

export const CreateLeadPayloadSchema = z.object({
  fbc: z.string().trim().min(1).max(512),
  fbp: z.string().trim().min(1).max(512),
  userAgent: z.string().trim().min(1).max(2048),
  metaPixelId: z.string().trim().min(1).max(128),
});

export type CreateLeadPayload = z.infer<typeof CreateLeadPayloadSchema>;

export type CreateLeadResult = {
  code: string;
  number: string;
};

type SelectNumberResult =
  | {
      ok: true;
      number: string;
    }
  | {
      ok: false;
      reason: 'LANDING_NOT_FOUND' | 'NO_AVAILABLE_CASHIER';
    };

export type LeadMatchResult =
  | 'NO_CODE'
  | 'INVALID_CODE'
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'ALREADY_USED'
  | 'SESSION_NOT_MAPPED'
  | 'MATCHED'
  | 'PHONE_LOOKUP_FAILED';

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function getExpiresAt(now: Date): Date {
  const maxHours = 7 * 24;
  const ttlHours = Math.min(config.LEADS_CODE_TTL_HOURS, maxHours);
  return new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
}

function extractLeadCode(body: string): string | null {
  const match = body.match(/\bCODIGO\s*:\s*([a-z0-9]{8})\b/i);
  if (!match?.[1]) return null;
  return match[1].toUpperCase();
}

async function selectCashierNumberForLanding(
  metaPixelId: string,
): Promise<SelectNumberResult> {
  const candidates = await getActiveLandingCashierCandidatesByMetaPixelId(metaPixelId);
  if (!candidates) {
    return {
      ok: false,
      reason: 'LANDING_NOT_FOUND',
    };
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: 'NO_AVAILABLE_CASHIER',
    };
  }

  const sessions = await getSessions();
  const workingSessionNumbers = new Map<string, string>();

  for (const session of sessions) {
    if (session.status !== 'WORKING') {
      continue;
    }

    const number = session.me.id.split('@')[0] ?? '';
    if (!number) {
      continue;
    }

    workingSessionNumbers.set(session.name, number);
  }

  const eligible = candidates
    .map((candidate) => ({
      cashierId: candidate.cashierId,
      number: workingSessionNumbers.get(candidate.sessionName) ?? null,
    }))
    .filter(
      (
        item,
      ): item is {
        cashierId: string;
        number: string;
      } => Boolean(item.number),
    );

  if (eligible.length === 0) {
    return {
      ok: false,
      reason: 'NO_AVAILABLE_CASHIER',
    };
  }

  const countsByCashier = await getContactedLeadCountByCashierForLanding(
    metaPixelId,
    eligible.map((item) => item.cashierId),
  );

  let minCount = Number.POSITIVE_INFINITY;
  for (const item of eligible) {
    const count = countsByCashier.get(item.cashierId) ?? 0;
    if (count < minCount) {
      minCount = count;
    }
  }

  const leastUsed = eligible.filter(
    (item) => (countsByCashier.get(item.cashierId) ?? 0) === minCount,
  );

  const selected = leastUsed[Math.floor(Math.random() * leastUsed.length)];

  return {
    ok: true,
    number: selected.number,
  };
}

export async function createLead(
  payload: CreateLeadPayload,
): Promise<CreateLeadResult> {
  const selectedNumber = await selectCashierNumberForLanding(payload.metaPixelId);

  if (!selectedNumber.ok) {
    throw new Error(selectedNumber.reason);
  }

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
        number: selectedNumber.number,
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

  if (lead.status !== 'NOT_CONTACTED' || lead.contactedAt) {
    return 'ALREADY_USED';
  }

  const now = new Date();
  if (lead.expiresAt <= now) {
    await expireLeadIfStillOpen(lead.id);
    return 'EXPIRED';
  }

  const cashier = await getCashierBySessionName(session);
  if (!cashier) {
    return 'SESSION_NOT_MAPPED';
  }

  try {
    const { pn } = await getNumberByLid(session, chatId);
    const phone = pn.split('@')[0];

    if (!phone) {
      return 'PHONE_LOOKUP_FAILED';
    }

    const updatedRows = await markLeadAsContacted(
      lead.id,
      phone,
      cashier.id,
      now,
    );
    return updatedRows === 1 ? 'MATCHED' : 'ALREADY_USED';
  } catch {
    return 'PHONE_LOOKUP_FAILED';
  }
}
