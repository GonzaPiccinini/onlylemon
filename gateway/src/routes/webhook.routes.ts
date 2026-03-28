import { Router } from 'express';
import { handleWebhook } from '../services/webhook.service.js';

export const webhookRouter = Router();

webhookRouter.post('/webhook', async (req, res) => {
  try {
    await handleWebhook(req, res);
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
