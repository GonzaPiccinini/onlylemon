import { Request, Response } from 'express';
import { getSessions } from '../waha/client.js';
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
    const sessions = await getSessions();
    const numbers = sessions.map((session) => session.me.id.split('@')[0]);
    const lead = await createLead(parseResult.data);

    return res.status(201).json({
      code: lead.code,
      expiresAt: lead.expiresAt.toISOString(),
      numbers,
    });
  } catch (error) {
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
