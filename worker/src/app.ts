import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import hpp from 'hpp';

import { config } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { requestMetrics } from './middleware/request-metrics.js';
import { aiRouter } from './routes/ai.js';
import { healthRouter } from './routes/health.js';
import { metricsRouter } from './routes/metrics.js';
import { bucketRouter } from './routes/bucket.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const log = {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      };

      if (res.statusCode >= 500) logger.error(log, 'HTTP request failed');
      else if (res.statusCode >= 400)
        logger.warn(log, 'HTTP request completed with warning');
      else logger.info(log, 'HTTP request completed');
    });
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(hpp());
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: false,
    }),
  );
  app.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      limit: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use(requestMetrics);

  app.use('/health', healthRouter);
  app.use(metricsRouter);
  app.use('/ai', aiRouter);
  // app.use('/bucket', bucketRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
