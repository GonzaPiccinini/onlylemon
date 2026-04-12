import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';

export const errorMiddleware = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  logger.error({ err: error }, 'Unhandled express error');
  res.status(500).json({ error: 'Internal server error' });
};
