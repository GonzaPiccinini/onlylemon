import { timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

const WEBHOOK_TOKEN_HEADER = 'x-webhook-token';

const safeEqual = (a: string, b: string): boolean => {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
};

export const requireWebhookToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!env.webhookToken) {
    res.status(503).json({ error: 'Webhook auth is not configured' });
    return;
  }

  const token = req.header(WEBHOOK_TOKEN_HEADER);

  if (!token || !safeEqual(token, env.webhookToken)) {
    res.status(401).json({ error: 'Unauthorized webhook request' });
    return;
  }

  next();
};
