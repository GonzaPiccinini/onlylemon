import cors from 'cors';
import express from 'express';
import { healthRouter } from './routes/health.routes.js';
import { webhookRouter } from './routes/webhook.routes.js';
import { metricsRouter } from './routes/metrics.routes.js';
import { env } from './config/env.js';
import { requestLoggingMiddleware } from './middlewares/request-logging.middleware.js';
import { logger } from './lib/logger.js';

export const createApp = () => {
  const app = express();

  const allowedOrigins = new Set(env.corsAllowedOrigins);
  const allowedMethods = ['POST'];
  const allowedHeaders = ['Content-Type', 'x-webhook-token', 'x-request-id'];

  app.use(requestLoggingMiddleware);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error('Origin not allowed by CORS'));
      },
      methods: allowedMethods,
      allowedHeaders,
    }),
  );
  app.use(express.json({ limit: env.maxPayloadBytes }));
  app.use('/api', healthRouter);
  app.use('/api', webhookRouter);
  app.use(metricsRouter);

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (
        error instanceof Error &&
        error.message === 'Origin not allowed by CORS'
      ) {
        res.status(403).json({ error: 'Origin not allowed' });
        return;
      }

      if (
        typeof error === 'object' &&
        error !== null &&
        'type' in error &&
        error.type === 'entity.too.large'
      ) {
        res.status(413).json({ error: 'Payload too large' });
        return;
      }

      logger.error({ err: error }, 'Unhandled app error');
      res.status(500).json({ error: 'Internal server error' });
    },
  );

  return app;
};
