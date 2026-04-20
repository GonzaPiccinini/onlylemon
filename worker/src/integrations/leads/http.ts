import { Request, Response } from 'express';
import {
  CreateLeadPayloadSchema,
  LeadFbcConflictError,
  createLead,
  mapLeadCodeToPhone,
} from './service.js';
import { logger } from '../../lib/logger.js';
import { leadsCreatedTotal, leadsMatchedTotal } from '../../lib/metrics.js';

type HttpErrorResponse = {
  status: number;
  body: {
    message: string;
  };
};

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

  if (!(error instanceof Error)) {
    return null;
  }

  if (error.message === 'LANDING_NOT_FOUND') {
    return {
      status: 404,
      body: {
        message: 'Landing not found or disabled',
      },
    };
  }

  if (error.message === 'NO_AVAILABLE_CASHIER') {
    return {
      status: 409,
      body: {
        message: 'No available cashier number for this landing',
      },
    };
  }

  return null;
}

export async function leadsPost(req: Request, res: Response) {
  const parseResult = CreateLeadPayloadSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      message: 'Invalid body data',
      details: parseResult.error.flatten(),
    });
  }

  try {
    const lead = await createLead(parseResult.data);

    leadsCreatedTotal.labels(parseResult.data.metaPixelId).inc();
    logger.info(
      { event: 'lead_created', metaPixelId: parseResult.data.metaPixelId },
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
