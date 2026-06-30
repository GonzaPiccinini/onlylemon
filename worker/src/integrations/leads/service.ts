import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { leadCodeCollisionsTotal } from '../../lib/metrics.js';
import { logger } from '../../lib/logger.js';
import { getNumberByLid } from '../waha/client.js';
import {
  getActiveLandingCashierCandidatesByLandingId,
  getAllLinkedCashierCandidatesByLandingId,
  getLandingFallbackPhonesByLandingId,
  getContactedLeadCountByCashierForLanding,
  getLeadByCode,
  getLeadByFbc,
  markLeadAsContacted,
  saveLead,
} from '../../persistence/repositories/leadsRepository.js';
import { getSessionBySessionName } from '../../modules/cashier/whatsapp-session.repository.js';
import { getLandingById } from '../../modules/admin/admin.repository.js';
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

/**
 * Phase 2 — re-keyed payload: `landingId` replaces `metaPixelId` as the
 * public routing key. The pixel number is now a server-side snapshot.
 */
export const CreateLeadPayloadSchema = z.object({
  // fbc/fbp come from cookies set by the Meta pixel. Ad-blockers block the
  // pixel (net::ERR_BLOCKED_BY_CLIENT), so the cookies never get created and
  // the landing sends null. Accept the lead anyway (contact must succeed) and
  // normalize to '' — attribution degrades gracefully via CAPI.
  fbc: z
    .string()
    .trim()
    .max(1024)
    .nullish()
    .transform((value) => value ?? ''),
  fbp: z
    .string()
    .trim()
    .max(1024)
    .nullish()
    .transform((value) => value ?? ''),
  userAgent: z.string().trim().min(1).max(2048),
  landingId: z.string().trim().min(1).max(256),
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
  landingId: string;
  constructor(landingId: string) {
    super('FALLBACK_INVARIANT_VIOLATION');
    this.name = 'FallbackInvariantViolationError';
    this.landingId = landingId;
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

/**
 * Shape returned by saveLead (Phase 2): includes the MetaPixel snapshot
 * (metaPixelRelation) so both CAPI events read the same pixel/token/url.
 */
type LeadForCreateFlow = {
  id: string;
  code: string;
  metaPixelId: string;          // OLD scalar — returned by Prisma (still NOT NULL)
  metaPixelRef: string | null;  // transitional FK → MetaPixel.id
  metaPixelRelation: {
    id: string;
    pixelId: string;
    accessToken: string;
    label: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  eventSourceUrl: string | null;  // snapshot of Landing.url
  landingId: string | null;
  fbc: string;
  fbp: string;
  userAgent: string;
};

type LeadToCreate = {
  code: string;
  adCode?: string;
  fbc: string;
  fbp: string;
  userAgent: string;
  landingId: string;
  metaPixelRef: string;
  eventSourceUrl: string;
  metaPixelId: string;  // OLD scalar still NOT NULL — written from landing.metaPixelRelation.pixelId
};

/**
 * Minimal structural type for the landing data needed by the create flow.
 * Using a plain type (not `typeof getLandingById`) keeps mocks simple
 * and avoids coupling tests to Prisma's fluent API wrapper types.
 */
type LandingForCreate = {
  id: string;
  url: string;
  status: string;
  metaPixelRef: string | null;
  metaPixelRelation: { id: string; pixelId: string; label: string | null } | null;
} | null;

export type CreateLeadDependencies = {
  selectCashierNumberForLanding: (
    landingId: string,
  ) => Promise<SelectNumberResult>;
  getLandingById: (id: string) => Promise<LandingForCreate>;
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
  getActiveLandingCashierCandidatesByLandingId: typeof getActiveLandingCashierCandidatesByLandingId;
  getAllLinkedCashierCandidatesByLandingId: typeof getAllLinkedCashierCandidatesByLandingId;
  getLandingFallbackPhonesByLandingId: typeof getLandingFallbackPhonesByLandingId;
  getSessions: typeof getSessions;
  getContactedLeadCountByCashierForLanding: typeof getContactedLeadCountByCashierForLanding;
  getNow: () => Date;
  getRandom: () => number;
};

const defaultSelectCashierDependencies: SelectCashierDependencies = {
  getActiveLandingCashierCandidatesByLandingId,
  getAllLinkedCashierCandidatesByLandingId,
  getLandingFallbackPhonesByLandingId,
  getSessions,
  getContactedLeadCountByCashierForLanding,
  getNow: () => new Date(),
  getRandom: () => Math.random(),
};

export async function selectCashierNumberForLandingWithDependencies(
  landingId: string,
  dependencies: SelectCashierDependencies,
): Promise<SelectNumberResult> {
  const candidates =
    await dependencies.getActiveLandingCashierCandidatesByLandingId(landingId);
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
  const l1Eligible = candidates.filter((c) => workingSessionNumbers.has(c.sessionName));

  if (l1Eligible.length === 0) {
    // D2: Level 2 — any ACTIVE cashier session bound to landing that is WAHA-WORKING
    const l2Candidates = await dependencies.getAllLinkedCashierCandidatesByLandingId(landingId);

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
    const fallbackPhones = await dependencies.getLandingFallbackPhonesByLandingId(landingId);

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
    landingId,
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
  landingId: string,
): Promise<SelectNumberResult> {
  return selectCashierNumberForLandingWithDependencies(
    landingId,
    defaultSelectCashierDependencies,
  );
}

/**
 * Phase 2 — dispatch Lead CAPI event from the lead's snapshot.
 * Reads pixel + token from `lead.metaPixelRelation` and url from `lead.eventSourceUrl`.
 * Never resolves live from the landing — immune to later pixel/url reassignments.
 */
async function dispatchLeadCreatedEvent(lead: LeadForCreateFlow): Promise<void> {
  if (!lead.metaPixelRelation || !lead.eventSourceUrl) {
    logger.error({
      event: 'meta_snapshot_missing',
      leadId: lead.id,
      hasRelation: Boolean(lead.metaPixelRelation),
      hasUrl: Boolean(lead.eventSourceUrl),
    });
    return;
  }

  const sent = await sendLeadEvent({
    eventId: `lead-${lead.id}`,
    leadCode: lead.code,
    fbc: lead.fbc,
    fbp: lead.fbp,
    userAgent: lead.userAgent,
    metaPixelId: lead.metaPixelRelation.pixelId,
    metaAccessToken: lead.metaPixelRelation.accessToken,
    eventSourceUrl: lead.eventSourceUrl,
  });

  if (!sent) {
    logger.error({
      event: 'meta_conversion_failed',
      leadId: lead.id,
      eventName: 'Lead',
    });
  }
}

/**
 * Phase 2 — dispatch Contact CAPI event from the lead's snapshot.
 * Same source of truth as Lead event: metaPixelRelation + eventSourceUrl.
 */
async function dispatchLeadContactedEvent(lead: {
  id: string;
  code: string;
  metaPixelId: string;           // OLD scalar, still present in Lead row
  metaPixelRelation: {
    pixelId: string;
    accessToken: string;
  } | null;
  eventSourceUrl: string | null;
  fbc: string;
  fbp: string;
  userAgent: string;
  phone: string;
}): Promise<void> {
  if (!lead.metaPixelRelation || !lead.eventSourceUrl) {
    logger.error({
      event: 'meta_snapshot_missing',
      leadId: lead.id,
      hasRelation: Boolean(lead.metaPixelRelation),
      hasUrl: Boolean(lead.eventSourceUrl),
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
    metaPixelId: lead.metaPixelRelation.pixelId,
    metaAccessToken: lead.metaPixelRelation.accessToken,
    eventSourceUrl: lead.eventSourceUrl,
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
  // Cast: Prisma fluent client is structurally compatible with LandingForCreate
  // (it extends the plain data type), but TS cannot infer that automatically.
  getLandingById: getLandingById as (id: string) => Promise<LandingForCreate>,
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
  // Phase 2 — resolve landing first to get snapshot data and check status.
  const landing = await dependencies.getLandingById(payload.landingId);

  if (!landing) {
    throw new Error('LANDING_NOT_FOUND');
  }

  if (landing.status === 'DISABLED') {
    throw new Error('LANDING_DISABLED');
  }

  const selectedNumber = await dependencies.selectCashierNumberForLanding(
    payload.landingId,
  );

  if (!selectedNumber.ok) {
    if (selectedNumber.reason === 'LANDING_NOT_FOUND') {
      throw new Error(selectedNumber.reason);
    }
    if (selectedNumber.reason === 'FALLBACK_INVARIANT_VIOLATION') {
      logger.error({
        event: 'fallback_invariant_violation',
        landingId: payload.landingId,
      });
      throw new FallbackInvariantViolationError(payload.landingId);
    }
  }

  const resolvedNumber = selectedNumber.ok ? selectedNumber.number : '';

  // Only dedup when we actually have an fbc. Leads from blocked-pixel visitors
  // share an empty fbc, so dedup-ing on '' would reject every one after the first.
  if (payload.fbc) {
    const existingLeadByFbc = await dependencies.getLeadByFbc(payload.fbc);
    if (existingLeadByFbc) {
      throw new LeadFbcConflictError();
    }
  }

  // Build snapshot data from the landing resolved above.
  // metaPixelRef is the FK → MetaPixel.id (UUID snapshot).
  // metaPixelId (old scalar) is the pixel NUMBER — still NOT NULL in schema during Expand.
  const metaPixelRef = landing.metaPixelRef ?? '';
  const eventSourceUrl = landing.url;
  const oldScalarPixelId = landing.metaPixelRelation?.pixelId ?? '';

  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const code = dependencies.generateCode();

    try {
      const lead = await dependencies.saveLead({
        fbc: payload.fbc,
        fbp: payload.fbp,
        userAgent: payload.userAgent,
        landingId: payload.landingId,
        adCode: payload.adCode,
        code,
        metaPixelRef,
        eventSourceUrl,
        metaPixelId: oldScalarPixelId,  // OLD scalar — still NOT NULL during Expand
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

  // Phase 2: getLeadByCode now includes metaPixelRelation for snapshot-based dispatch
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

    // Phase 2 — dispatch Contact from lead snapshot (metaPixelRelation + eventSourceUrl)
    void dispatchLeadContactedEvent({
      id: lead.id,
      code: lead.code,
      metaPixelId: lead.metaPixelId,
      metaPixelRelation: lead.metaPixelRelation,
      eventSourceUrl: lead.eventSourceUrl,
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
