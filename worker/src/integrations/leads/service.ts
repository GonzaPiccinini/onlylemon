import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { config } from '../../config/env.js';
import { leadCodeCollisionsTotal } from '../../lib/metrics.js';
import { logger } from '../../lib/logger.js';
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
import { getLandingByMetaPixelId } from '../../modules/admin/admin.repository.js';
import { getSessions } from '../waha/client.js';
import { sendContactEvent, sendLeadEvent } from './conversion.js';

const CODE_LENGTH = 8;
const MAX_CODE_GENERATION_ATTEMPTS = 5;
const generateCode = customAlphabet(
  'ABCDEFGHIJQLMNOPQRSTUVWXYZ0123456789',
  CODE_LENGTH,
);

export const CreateLeadPayloadSchema = z.object({
  fbc: z.string().trim().min(1).max(1024),
  fbp: z.string().trim().min(1).max(1024),
  userAgent: z.string().trim().min(1).max(2048),
  metaPixelId: z.string().trim().min(1).max(256),
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

const ARGENTINA_UTC_OFFSET_HOURS = -3;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function getStartOfTodayInArgentina(): Date {
  const offsetMs = ARGENTINA_UTC_OFFSET_HOURS * MS_PER_HOUR;
  const nowAsArgentina = new Date(Date.now() + offsetMs);
  return new Date(
    Date.UTC(
      nowAsArgentina.getUTCFullYear(),
      nowAsArgentina.getUTCMonth(),
      nowAsArgentina.getUTCDate(),
    ) - offsetMs,
  );
}

async function selectCashierNumberForLanding(
  metaPixelId: string,
): Promise<SelectNumberResult> {
  const candidates =
    await getActiveLandingCashierCandidatesByMetaPixelId(metaPixelId);
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

  const startOfDay = getStartOfTodayInArgentina();
  const startOfNextDay = new Date(startOfDay.getTime() + MS_PER_DAY);

  const countsByCashier = await getContactedLeadCountByCashierForLanding(
    metaPixelId,
    eligible.map((item) => item.cashierId),
    startOfDay,
    startOfNextDay,
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

async function dispatchLeadCreatedEvent(lead: {
  id: string;
  metaPixelId: string;
  fbc: string;
  fbp: string;
  userAgent: string;
}): Promise<void> {
  const landing = await getLandingByMetaPixelId(lead.metaPixelId);
  if (!landing) {
    logger.error({
      event: 'meta_landing_not_found',
      leadId: lead.id,
      metaPixelId: lead.metaPixelId,
    });
    return;
  }

  const sent = await sendLeadEvent({
    eventId: `lead-${lead.id}`,
    fbc: lead.fbc,
    fbp: lead.fbp,
    userAgent: lead.userAgent,
    metaPixelId: lead.metaPixelId,
    metaAccessToken: landing.metaAccessToken,
    eventSourceUrl: landing.url,
  });

  if (!sent) {
    logger.error({
      event: 'meta_conversion_failed',
      leadId: lead.id,
      eventName: 'Lead',
    });
  }
}

async function dispatchLeadContactedEvent(lead: {
  id: string;
  metaPixelId: string;
  fbc: string;
  fbp: string;
  userAgent: string;
  phone: string;
}): Promise<void> {
  const landing = await getLandingByMetaPixelId(lead.metaPixelId);
  if (!landing) {
    logger.error({
      event: 'meta_landing_not_found',
      leadId: lead.id,
      metaPixelId: lead.metaPixelId,
    });
    return;
  }

  const sent = await sendContactEvent({
    eventId: `contact-${lead.id}`,
    phone: lead.phone,
    fbc: lead.fbc,
    fbp: lead.fbp,
    userAgent: lead.userAgent,
    metaPixelId: lead.metaPixelId,
    metaAccessToken: landing.metaAccessToken,
    eventSourceUrl: landing.url,
  });

  if (!sent) {
    logger.error({
      event: 'meta_conversion_failed',
      leadId: lead.id,
      eventName: 'Contact',
    });
  }
}

export async function createLead(
  payload: CreateLeadPayload,
): Promise<CreateLeadResult> {
  const selectedNumber = await selectCashierNumberForLanding(
    payload.metaPixelId,
  );

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

      void dispatchLeadCreatedEvent(lead).catch((err) => {
        logger.error(
          { err, leadId: lead.id },
          'meta_lead_event_dispatch_error',
        );
      });

      return {
        code: lead.code,
        number: selectedNumber.number,
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        leadCodeCollisionsTotal.inc();
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

    if (updatedRows !== 1) {
      return 'ALREADY_USED';
    }

    void dispatchLeadContactedEvent({
      id: lead.id,
      metaPixelId: lead.metaPixelId,
      fbc: lead.fbc,
      fbp: lead.fbp,
      userAgent: lead.userAgent,
      phone,
    }).catch((err) => {
      logger.error(
        { err, leadId: lead.id },
        'meta_contact_event_dispatch_error',
      );
    });

    return 'MATCHED';
  } catch {
    return 'PHONE_LOOKUP_FAILED';
  }
}
