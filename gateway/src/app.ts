import express from 'express';
import { healthRouter } from './routes/health.routes.js';
import { webhookRouter } from './routes/webhook.routes.js';

export const createApp = () => {
  const app = express();

  app.use(express.json());
  app.use('/api', healthRouter);
  app.use('/api', webhookRouter);

  return app;
};
