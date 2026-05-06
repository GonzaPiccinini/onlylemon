import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { config } from '../../config/env.js';
import { leadCodeCollisionsTotal } from '../../lib/metrics.js';
import { logger } from '../../lib/logger.js';
import { getNumberByLid } from '../waha/client.js';
import {
  getActiveLandingCashierCandidatesByMetaPixelId,
  getContactedLeadCountByCashierForLanding,
  getLeadByCode,
  getLeadByFbc,
  markLeadAsContacted,
  saveLead,
} from '../../persistence/repositories/leadsRepository.js';
import { getCashierBySessionName } from '../../modules/cashier/cashier.repository.js';
import { getLandingByMetaPixelId } from '../../modules/admin/admin.repository.js';
import { getSessions } from '../waha/client.js';
import { sendContactEvent, sendLeadEvent } from './conversion.js';
import {
  argentinaDayEndUtcExclusive,
  argentinaDayStartUtc,
  formatArgentinaDayKey,
} from '../../utils/timezone.js';

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
  adCode: z.string().trim().min(1).max(256).optional(),
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

export class LeadFbcConflictError extends Error {
  constructor() {
    super('LEAD_FBC_CONFLICT');
    this.name = 'LeadFbcConflictError';
  }
}

type UniqueConstraintKind = 'code' | 'unknown' | null;

function getUniqueConstraintKind(error: unknown): UniqueConstraintKind {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const maybeError = error as {
    code?: unknown;
    meta?: {
      target?: unknown;
    };
  };

  if (maybeError.code !== 'P2002') {
    return null;
  }

  const target = maybeError.meta?.target;
  const targets = Array.isArray(target)
    ? target
    : typeof target === 'string'
      ? [target]
      : [];

  if (targets.includes('code')) {
    return 'code';
  }

  return 'unknown';
}

type LeadForCreateFlow = {
  id: string;
  code: string;
  metaPixelId: string;
  fbc: string;
  fbp: string;
  userAgent: string;
};

type LeadToCreate = CreateLeadPayload & {
  code: string;
};

export type CreateLeadDependencies = {
  selectCashierNumberForLanding: (
    metaPixelId: string,
  ) => Promise<SelectNumberResult>;
  getLeadByFbc: (fbc: string) => Promise<{ id: string } | null>;
  saveLead: (data: LeadToCreate) => Promise<LeadForCreateFlow>;
  dispatchLeadCreatedEvent: (lead: LeadForCreateFlow) => Promise<void>;
  generateCode: () => string;
  getNow: () => Date;
  onCodeCollision: () => void;
};

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

const MIN_ACTIVE_MS = 1;
const DEFICIT_TIE_EPSILON = 0.25;

type SelectCashierDependencies = {
  getActiveLandingCashierCandidatesByMetaPixelId: typeof getActiveLandingCashierCandidatesByMetaPixelId;
  getSessions: typeof getSessions;
  getContactedLeadCountByCashierForLanding: typeof getContactedLeadCountByCashierForLanding;
  getNow: () => Date;
  getRandom: () => number;
};

const defaultSelectCashierDependencies: SelectCashierDependencies = {
  getActiveLandingCashierCandidatesByMetaPixelId,
  getSessions,
  getContactedLeadCountByCashierForLanding,
  getNow: () => new Date(),
  getRandom: () => Math.random(),
};

export async function selectCashierNumberForLandingWithDependencies(
  metaPixelId: string,
  dependencies: SelectCashierDependencies,
): Promise<SelectNumberResult> {
  const candidates =
    await dependencies.getActiveLandingCashierCandidatesByMetaPixelId(metaPixelId);
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

  const sessions = await dependencies.getSessions();
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
      activeSince: candidate.activeSince,
      number: workingSessionNumbers.get(candidate.sessionName) ?? null,
    }))
    .filter(
      (
        item,
      ): item is {
        cashierId: string;
        activeSince: Date | null;
        number: string;
      } => Boolean(item.number),
    );

  if (eligible.length === 0) {
    return {
      ok: false,
      reason: 'NO_AVAILABLE_CASHIER',
    };
  }

  const now = dependencies.getNow();
  const todayKey = formatArgentinaDayKey(now);
  const startOfDay = argentinaDayStartUtc(todayKey);
  const startOfNextDay = argentinaDayEndUtcExclusive(todayKey);

  const countsByCashier = await dependencies.getContactedLeadCountByCashierForLanding(
    metaPixelId,
    eligible.map((item) => item.cashierId),
    startOfDay,
    startOfNextDay,
  );

  const eligibleWithStats = eligible.map((item) => {
    const activeStart = item.activeSince
      ? new Date(Math.max(item.activeSince.getTime(), startOfDay.getTime()))
      : startOfDay;
    const activeMs = Math.max(now.getTime() - activeStart.getTime(), MIN_ACTIVE_MS);

    return {
      ...item,
      activeMs,
      countToday: countsByCashier.get(item.cashierId) ?? 0,
    };
  });

  const totalActiveMs = eligibleWithStats.reduce(
    (sum, item) => sum + item.activeMs,
    0,
  );
  const totalLeadsToday = eligibleWithStats.reduce(
    (sum, item) => sum + item.countToday,
    0,
  );
  const totalLeadsAfterNext = totalLeadsToday + 1;

  const scored = eligibleWithStats.map((item) => {
    const timeShare = item.activeMs / totalActiveMs;
    const expectedLeadsAfterNext = timeShare * totalLeadsAfterNext;

    return {
      ...item,
      deficit: expectedLeadsAfterNext - item.countToday,
    };
  });

  const highestDeficit = scored.reduce(
    (max, item) => Math.max(max, item.deficit),
    Number.NEGATIVE_INFINITY,
  );

  const topCandidates = scored.filter(
    (item) => item.deficit >= highestDeficit - DEFICIT_TIE_EPSILON,
  );

  const selected =
    topCandidates[
      Math.min(
        Math.floor(dependencies.getRandom() * topCandidates.length),
        topCandidates.length - 1,
      )
    ];

  return {
    ok: true,
    number: selected.number,
  };
}

async function selectCashierNumberForLanding(
  metaPixelId: string,
): Promise<SelectNumberResult> {
  return selectCashierNumberForLandingWithDependencies(
    metaPixelId,
    defaultSelectCashierDependencies,
  );
}

async function dispatchLeadCreatedEvent(lead: {
  id: string;
  code: string;
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
    leadCode: lead.code,
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
  code: string;
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
    leadCode: lead.code,
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

const defaultCreateLeadDependencies: CreateLeadDependencies = {
  selectCashierNumberForLanding,
  getLeadByFbc,
  saveLead,
  dispatchLeadCreatedEvent,
  generateCode,
  getNow: () => new Date(),
  onCodeCollision: () => {
    leadCodeCollisionsTotal.inc();
  },
};

export async function createLeadWithDependencies(
  payload: CreateLeadPayload,
  dependencies: CreateLeadDependencies,
): Promise<CreateLeadResult> {
  const selectedNumber = await dependencies.selectCashierNumberForLanding(
    payload.metaPixelId,
  );

  if (!selectedNumber.ok) {
    if (selectedNumber.reason === 'LANDING_NOT_FOUND') {
      throw new Error(selectedNumber.reason);
    }
  }

  const resolvedNumber = selectedNumber.ok ? selectedNumber.number : '';

  const existingLeadByFbc = await dependencies.getLeadByFbc(payload.fbc);
  if (existingLeadByFbc) {
    throw new LeadFbcConflictError();
  }

  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const code = dependencies.generateCode();
    // NOTE: expiresAt removed in meta-conversions-refactor; getExpiresAt kept for config compatibility

    try {
      const lead = await dependencies.saveLead({
        ...payload,
        code,
      });

      void dependencies.dispatchLeadCreatedEvent(lead).catch((err) => {
        logger.error(
          { err, leadId: lead.id },
          'meta_lead_event_dispatch_error',
        );
      });

      return {
        code: lead.code,
        number: resolvedNumber,
      };
    } catch (error) {
      const uniqueConstraintKind = getUniqueConstraintKind(error);

      if (uniqueConstraintKind === 'code') {
        dependencies.onCodeCollision();
        continue;
      }

      throw error;
    }
  }

  throw new Error('Could not generate unique lead code');
}

export async function createLead(
  payload: CreateLeadPayload,
): Promise<CreateLeadResult> {
  return createLeadWithDependencies(payload, defaultCreateLeadDependencies);
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
  // NOTE: expiresAt guard removed in meta-conversions-refactor (Lead.expiresAt was dropped)

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
      code: lead.code,
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
