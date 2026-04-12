import { Request, Response } from 'express';
import {
  CreateLeadPayloadSchema,
  createLead,
  mapLeadCodeToPhone,
} from './service.js';
import { logger } from '../../lib/logger.js';
import { leadsCreatedTotal, leadsMatchedTotal } from '../../lib/metrics.js';

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
    if (error instanceof Error) {
      if (error.message === 'LANDING_NOT_FOUND') {
        return res.status(404).json({
          message: 'Landing not found or disabled',
        });
      }

      if (error.message === 'NO_AVAILABLE_CASHIER') {
        return res.status(409).json({
          message: 'No available cashier number for this landing',
        });
      }
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
