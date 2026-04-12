import { Router } from 'express';
import { handleWebhook } from '../services/webhook.service.js';
import { requireWebhookToken } from '../middlewares/webhook-auth.middleware.js';
import { requireJsonContentType } from '../middlewares/require-json.middleware.js';
import { logger } from '../lib/logger.js';

export const webhookRouter = Router();

webhookRouter.post(
  '/webhook',
  requireWebhookToken,
  requireJsonContentType,
  async (req, res) => {
    try {
      await handleWebhook(req, res);
    } catch (error) {
      logger.error({ err: error }, 'Error handling webhook');
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);
