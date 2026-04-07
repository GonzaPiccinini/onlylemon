import express from 'express';
import cors, { CorsOptions } from 'cors';

import { config } from '../config/env.js';
import { worker } from './worker.js';
import { leadsPost } from '../integrations/leads/client.js';

const app = express();
const port = config.PORT; // NO TOCAR PORQUE ROMPE EL CODIGO DE OPENAI

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post('/receive', (_req, res) => {
  res.status(202).json({ received: true });
});

app.post('/api/leads', leadsPost);

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
