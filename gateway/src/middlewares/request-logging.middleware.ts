import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';
import { httpRequestDurationSeconds } from '../lib/metrics.js';

const REQUEST_ID_HEADER = 'x-request-id';

export const requestLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const startedAt = process.hrtime.bigint();
  const requestId = req.header(REQUEST_ID_HEADER) ?? randomUUID();

  res.setHeader(REQUEST_ID_HEADER, requestId);

  res.on('finish', () => {
    const durationMs =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const route = req.path;
    const statusCode = String(res.statusCode);

    httpRequestDurationSeconds
      .labels(req.method, route, statusCode)
      .observe(durationMs / 1000);

    logger.info({
      event: 'http_request',
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      userAgent: req.get('user-agent') ?? null,
    });
  });

  next();
};
