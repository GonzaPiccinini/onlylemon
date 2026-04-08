import express from 'express';
import cors from 'cors';

import { config } from '../config/env.js';
import { worker } from './worker.js';
import { leadsPost } from '../integrations/leads/client.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { adminRouter } from '../modules/admin/admin.routes.js';
import { cashierRouter } from '../modules/cashier/cashier.routes.js';

const app = express();
const port = config.PORT; // NO TOCAR PORQUE ROMPE EL CODIGO DE OPENAI

app.use(express.json());

app.use(
  cors({
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN,
    credentials: true,
  }),
);

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post('/receive', (_req, res) => {
  res.status(202).json({ received: true });
});

app.post('/api/leads', leadsPost);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/cashier', cashierRouter);

const server = app.listen(port, () => {
  console.log(`server listening on ${port}`);
});

async function shutdown(signal: string) {
  console.log(`shutdown signal: ${signal}`);
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
