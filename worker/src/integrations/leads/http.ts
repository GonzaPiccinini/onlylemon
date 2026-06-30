import { Request, Response } from 'express';
import {
  CreateLeadPayloadSchema,
  FallbackInvariantViolationError,
  LeadFbcConflictError,
  createLead,
  mapLeadCodeToPhone,
} from './service.js';
import { logger } from '../../lib/logger.js';
import { leadsCreatedTotal, leadsMatchedTotal } from '../../lib/metrics.js';
import { verifyCaptcha } from '../altcha.js';

type HttpErrorResponse = {
  status: number;
  body: { message: string } | { error: string };
};

export function extractAdCodeFromQueryParam(
  utmContent: Request['query']['utm_content'],
): string | undefined {
  if (Array.isArray(utmContent)) {
    const firstNonEmpty = utmContent.find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    return firstNonEmpty?.trim();
  }

  if (typeof utmContent !== 'string') {
    return undefined;
  }

  const normalized = utmContent.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function resolveCreateLeadHttpError(
  error: unknown,
): HttpErrorResponse | null {
  if (error instanceof LeadFbcConflictError) {
    return {
      status: 409,
      body: {
        message: 'Lead already exists for this fbc',
      },
    };
  }

  if (error instanceof FallbackInvariantViolationError) {
    return {
      status: 500,
      body: {
        error: 'FALLBACK_INVARIANT_VIOLATION',
      },
    };
  }

  if (!(error instanceof Error)) {
    return null;
  }

  if (error.message === 'LANDING_NOT_FOUND') {
    return {
      status: 404,
      body: {
        message: 'Landing not found',
      },
    };
  }

  if (error.message === 'LANDING_DISABLED') {
    return {
      status: 404,
      body: {
        message: 'Landing not found or disabled',
      },
    };
  }

  return null;
}

export async function leadsPost(req: Request, res: Response) {
  // Change B: Altcha proof-of-work captcha (replaces Turnstile)
  const altcha = req.body?.altcha;
  if (typeof altcha !== 'string' || altcha.trim().length === 0) {
    return res.status(400).json({ message: 'Captcha token required' });
  }

  const captchaValid = await verifyCaptcha(altcha, req.ip);
  if (!captchaValid) {
    return res.status(403).json({ message: 'Captcha verification failed' });
  }

  // Change A Phase 2: parse landingId from body (metaPixelId removed from contract)
  const adCode = extractAdCodeFromQueryParam(req.query.utm_content);
  const parseResult = CreateLeadPayloadSchema.safeParse({
    ...req.body,
    ...(adCode ? { adCode } : {}),
  });
  if (!parseResult.success) {
    return res.status(400).json({
      message: 'Invalid body data',
      details: parseResult.error.flatten(),
    });
  }

  try {
    const lead = await createLead(parseResult.data);

    leadsCreatedTotal.labels(parseResult.data.landingId).inc();
    logger.info(
      { event: 'lead_created', landingId: parseResult.data.landingId },
    );

    return res.status(201).json({
      code: lead.code,
      number: lead.number,
    });
  } catch (error) {
    const httpError = resolveCreateLeadHttpError(error);
    if (httpError) {
      return res.status(httpError.status).json(httpError.body);
    }

    logger.error({ err: error }, 'lead_create_error');
    res.status(500).json({
      message: 'Internal server error',
    });
  }
}

export async function mapLeadsToPhone(
  session: string,
  chatId: string,
  body: string,
) {
  try {
    const result = await mapLeadCodeToPhone(session, chatId, body);

    leadsMatchedTotal.labels(result).inc();

    if (result === 'MATCHED') {
      logger.info({ event: 'lead_matched', session, result });
    } else if (result !== 'NO_CODE') {
      logger.warn({ event: 'lead_match_failed', session, chatId, result });
    }
  } catch (error) {
    leadsMatchedTotal.labels('error').inc();
    logger.error({ err: error, session, chatId }, 'lead_match_error');
  }
}
