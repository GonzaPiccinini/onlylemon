import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';

const toSafeNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
};

export const requestLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const startedAt = process.hrtime.bigint();
  const requestId = req.header(REQUEST_ID_HEADER) ?? randomUUID();

  res.on('finish', () => {
    const finishedAt = process.hrtime.bigint();
    const durationMs = Number(finishedAt - startedAt) / 1_000_000;

    const payload = {
      level: 'info',
      event: 'http_request',
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      contentLength: toSafeNumber(res.getHeader('content-length')),
      userAgent: req.get('user-agent') ?? null,
    };

    console.info(JSON.stringify(payload));
  });

  next();
};
