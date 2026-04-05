import { timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

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
  next: NextFunction,
): void => {
  const token = req.header(env.webhookTokenHeader);

  if (!token || !safeEqual(token, env.webhookTokenValue)) {
    res.status(401).json({ error: 'Unauthorized webhook request' });
    return;
  }

  next();
};
