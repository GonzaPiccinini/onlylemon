import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { config } from '../core/config.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
import { observabilityMiddleware } from './middleware/observability.middleware.js';
import { healthRouter } from './routes/health.route.js';

export function createApp() {
  const app = express();

  app.use(observabilityMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(express.json());
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: false,
    }),
  );

  app.use('/health', healthRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
