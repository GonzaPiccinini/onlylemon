import type { NextFunction, Request, Response } from 'express';

import { logger } from '../../core/logger.js';
import {
  httpRequestDurationSeconds,
  httpRequestsTotal,
} from '../../core/metrics.js';

export function observabilityMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  const endMetric = httpRequestDurationSeconds.startTimer();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const route = req.route?.path ?? req.path;
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    httpRequestsTotal.inc(labels);
    endMetric(labels);

    const log = {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    };

    if (res.statusCode >= 500) logger.error(log, 'HTTP request failed');
    else if (res.statusCode >= 400) logger.warn(log, 'HTTP request completed with warning');
    else logger.info(log, 'HTTP request completed');
  });

  next();
}
