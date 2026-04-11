import { Request, Response } from 'express';
import {
  CreateLeadPayloadSchema,
  createLead,
  mapLeadCodeToPhone,
} from './service.js';

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

    console.error(`Error saving leads: ${error}`);
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
    if (result !== 'MATCHED' && result !== 'NO_CODE') {
      console.error('Lead mapping not completed', {
        result,
        session,
        chatId,
      });
    }
  } catch (error) {
    console.error(`Error updating leads: ${error}`);
  }
}
