import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { leadCodeCollisionsTotal } from '../../lib/metrics.js';
import { logger } from '../../lib/logger.js';
import { getNumberByLid } from '../waha/client.js';
import {
  getActiveLandingCashierCandidatesByMetaPixelId,
  getAllLinkedCashierCandidatesByMetaPixelId,
  getLandingFallbackPhonesByMetaPixelId,
  getContactedLeadCountByCashierForLanding,
  getLeadByCode,
  getLeadByFbc,
  markLeadAsContacted,
  saveLead,
} from '../../persistence/repositories/leadsRepository.js';
import { getSessionBySessionName } from '../../modules/cashier/whatsapp-session.repository.js';
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
      reason: 'LANDING_NOT_FOUND' | 'FALLBACK_INVARIANT_VIOLATION';
    };

export type LeadMatchResult =
  | 'NO_CODE'
  | 'INVALID_CODE'
  | 'NOT_FOUND'
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

export class FallbackInvariantViolationError extends Error {
  metaPixelId: string;
  constructor(metaPixelId: string) {
    super('FALLBACK_INVARIANT_VIOLATION');
    this.name = 'FallbackInvariantViolationError';
    this.metaPixelId = metaPixelId;
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


function extractLeadCode(body: string): string | null {
  const match = body.match(/\bCODIGO\s*:\s*([a-z0-9]{8})\b/i);
  if (!match?.[1]) return null;
  return match[1].toUpperCase();
}

const MIN_ACTIVE_MS = 1;
const DEFICIT_TIE_EPSILON = 0.25;

type SelectCashierDependencies = {
  getActiveLandingCashierCandidatesByMetaPixelId: typeof getActiveLandingCashierCandidatesByMetaPixelId;
  getAllLinkedCashierCandidatesByMetaPixelId: typeof getAllLinkedCashierCandidatesByMetaPixelId;
  getLandingFallbackPhonesByMetaPixelId: typeof getLandingFallbackPhonesByMetaPixelId;
  getSessions: typeof getSessions;
  getContactedLeadCountByCashierForLanding: typeof getContactedLeadCountByCashierForLanding;
  getNow: () => Date;
  getRandom: () => number;
};

const defaultSelectCashierDependencies: SelectCashierDependencies = {
  getActiveLandingCashierCandidatesByMetaPixelId,
  getAllLinkedCashierCandidatesByMetaPixelId,
  getLandingFallbackPhonesByMetaPixelId,
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

  // Single WAHA call — shared across L1, L2, and L3
  const sessions = await dependencies.getSessions();
  const workingSessionNumbers = new Map<string, string>();

  for (const session of sessions) {
    if (session.status !== 'WORKING') {
      continue;
    }

    const meId = session.me?.id;
    if (!meId) {
      continue;
    }
    const number = meId.split('@')[0] ?? '';
    if (!number) {
      continue;
    }

    workingSessionNumbers.set(session.name, number);
  }

  // D1: Level 1 — En-turno cashiers with WORKING sessions bound to landing.
  // Pivot: candidates are now sessions (not cashiers). Each session has a cashierId.
  // Filter by WORKING set, then group by cashier for deficit algorithm.
  const l1Eligible = candidates.filter((c) => workingSessionNumbers.has(c.sessionName));

  if (l1Eligible.length === 0) {
    // D2: Level 2 — any ACTIVE cashier session bound to landing that is WAHA-WORKING
    const l2Candidates = await dependencies.getAllLinkedCashierCandidatesByMetaPixelId(metaPixelId);

    if (l2Candidates && l2Candidates.length > 0) {
      const l2Eligible = l2Candidates.filter((c) => workingSessionNumbers.has(c.sessionName));

      if (l2Eligible.length > 0) {
        const l2Selected = l2Eligible[
          Math.min(
            Math.floor(dependencies.getRandom() * l2Eligible.length),
            l2Eligible.length - 1,
          )
        ]!;
        return { ok: true, number: workingSessionNumbers.get(l2Selected.sessionName)! };
      }
    }

    // D3: Level 3 — fallback phones for this landing (random uniform pick), unchanged
    const fallbackPhones = await dependencies.getLandingFallbackPhonesByMetaPixelId(metaPixelId);

    if (!fallbackPhones || fallbackPhones.length === 0) {
      return { ok: false, reason: 'FALLBACK_INVARIANT_VIOLATION' };
    }

    const l3Selected = fallbackPhones[
      Math.min(
        Math.floor(dependencies.getRandom() * fallbackPhones.length),
        fallbackPhones.length - 1,
      )
    ]!;
    return { ok: true, number: l3Selected.phone };
  }

  // D1: Deficit algorithm at cashier level — group l1Eligible sessions by cashierId
  const now = dependencies.getNow();
  const todayKey = formatArgentinaDayKey(now);
  const startOfDay = argentinaDayStartUtc(todayKey);
  const startOfNextDay = argentinaDayEndUtcExclusive(todayKey);

  // Unique cashierIds for this eligible set
  const eligibleCashierIds = [...new Set(l1Eligible.map((c) => c.cashierId))];

  const countsByCashier = await dependencies.getContactedLeadCountByCashierForLanding(
    metaPixelId,
    eligibleCashierIds,
    startOfDay,
    startOfNextDay,
  );

  // Compute per-cashier stats (take earliest activeSince among the cashier's eligible sessions)
  const cashierStats = eligibleCashierIds.map((cashierId) => {
    const cashierSessions = l1Eligible.filter((c) => c.cashierId === cashierId);
    const activeSince = cashierSessions.reduce(
      (earliest: Date | null, c) =>
        c.activeSince && (!earliest || c.activeSince < earliest) ? c.activeSince : earliest,
      null,
    );
    const activeStart = activeSince
      ? new Date(Math.max(activeSince.getTime(), startOfDay.getTime()))
      : startOfDay;
    const activeMs = Math.max(now.getTime() - activeStart.getTime(), MIN_ACTIVE_MS);

    return {
      cashierId,
      activeMs,
      countToday: countsByCashier.get(cashierId) ?? 0,
      sessions: cashierSessions,
    };
  });

  const totalActiveMs = cashierStats.reduce((sum, item) => sum + item.activeMs, 0);
  const totalLeadsToday = cashierStats.reduce((sum, item) => sum + item.countToday, 0);
  const totalLeadsAfterNext = totalLeadsToday + 1;

  const scored = cashierStats.map((item) => {
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

  const topCashiers = scored.filter(
    (item) => item.deficit >= highestDeficit - DEFICIT_TIE_EPSILON,
  );

  // Pick a random winning cashier (tie-break)
  const winnerCashier =
    topCashiers[
      Math.min(
        Math.floor(dependencies.getRandom() * topCashiers.length),
        topCashiers.length - 1,
      )
    ]!;

  // D1: From the winning cashier's WORKING sessions, pick one uniformly at random
  const winnerSessions = winnerCashier.sessions;
  const selectedSession =
    winnerSessions[
      Math.min(
        Math.floor(dependencies.getRandom() * winnerSessions.length),
        winnerSessions.length - 1,
      )
    ]!;

  return {
    ok: true,
    number: workingSessionNumbers.get(selectedSession.sessionName)!,
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

  const sent = await sendContactEvent({
    eventId: `contact-${lead.id}`,
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
      eventName: 'Contact',
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

  const sent = await sendLeadEvent({
    eventId: `lead-${lead.id}`,
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
      eventName: 'Lead',
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
    if (selectedNumber.reason === 'FALLBACK_INVARIANT_VIOLATION') {
      logger.error({
        event: 'fallback_invariant_violation',
        metaPixelId: payload.metaPixelId,
      });
      throw new FallbackInvariantViolationError(payload.metaPixelId);
    }
  }

  const resolvedNumber = selectedNumber.ok ? selectedNumber.number : '';

  const existingLeadByFbc = await dependencies.getLeadByFbc(payload.fbc);
  if (existingLeadByFbc) {
    throw new LeadFbcConflictError();
  }

  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const code = dependencies.generateCode();

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

  // D4: Use getSessionBySessionName (C1) instead of getCashierBySessionName
  const whatsappSession = await getSessionBySessionName(session);
  if (!whatsappSession) {
    return 'SESSION_NOT_MAPPED';
  }
  const cashierId = whatsappSession.cashier.id;

  try {
    const { pn } = await getNumberByLid(session, chatId);
    const phone = pn.split('@')[0];

    if (!phone) {
      return 'PHONE_LOOKUP_FAILED';
    }

    const updatedRows = await markLeadAsContacted(
      lead.id,
      phone,
      cashierId,
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
