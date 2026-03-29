import { Request, Response } from 'express';
import { getWebhookQueue } from '../config/bullmq.js';

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const webhookData = req.body;
    const queue = getWebhookQueue();

    const name = 'message';
    await queue.add(name, webhookData);
    res.status(200).json({ message: 'Webhook data stored successfully' });
  } catch (error) {
    console.error('Error storing webhook data in BullMQ:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
