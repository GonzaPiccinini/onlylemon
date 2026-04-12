import type { NextFunction, Request, Response } from 'express';
import { config } from '../../config/env.js';

export const requireWhatsappWebhookToken = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = req.header(config.WAHA_WEBHOOK_TOKEN_HEADER);
  if (!token || token !== config.WAHA_WEBHOOK_TOKEN_VALUE) {
    return res.status(401).json({ error: 'Unauthorized webhook request' });
  }

  return next();
};
