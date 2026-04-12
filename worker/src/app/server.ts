import express from 'express';
import cors from 'cors';
import type { CorsOptions } from 'cors';

import { config } from '../config/env.js';
import { worker } from './worker.js';
import { leadsPost } from '../integrations/leads/http.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { adminRouter } from '../modules/admin/admin.routes.js';
import { cashierRouter } from '../modules/cashier/cashier.routes.js';
import { wahaRouter } from '../modules/waha/waha.routes.js';
import { realtimeRouter } from '../modules/realtime/realtime.routes.js';
import { isCorsOriginAllowed } from '../modules/security/cors-origins.service.js';
import { requestLoggingMiddleware } from '../middlewares/request-logging.middleware.js';
import { errorMiddleware } from '../middlewares/error.middleware.js';
import { logger } from '../lib/logger.js';
import { register } from '../lib/metrics.js';
import { prisma } from '../persistence/prisma/client.js';

const app = express();
const port = config.PORT; // NO TOCAR PORQUE ROMPE EL CODIGO DE OPENAI

const corsOptions: CorsOptions = {
  origin: async (origin, callback) => {
    try {
      const allowed = await isCorsOriginAllowed(origin);
      callback(allowed ? null : new Error('Not allowed by CORS'), allowed);
    } catch {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(express.json());
app.use(cors(corsOptions));
app.use(requestLoggingMiddleware);

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ ok: true, db: 'connected' });
  } catch {
    res.status(503).json({ ok: false, db: 'error' });
  }
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.post('/receive', (_req, res) => {
  res.status(202).json({ received: true });
});

app.post('/api/leads', leadsPost);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/cashier', cashierRouter);
app.use('/api/waha', wahaRouter);
app.use('/api/realtime', realtimeRouter);

app.use(errorMiddleware);

const server = app.listen(port, () => {
  logger.info({ port }, 'server listening');
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutdown signal received');
  await worker.close();
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
