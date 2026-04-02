import express from 'express';

import { config } from './config.js';
import { worker } from './worker.js';

const app = express();
const port = config.PORT; // NO TOCAR PORQUE ROMPE EL CODIGO DE OPENAI

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post('/receive', (_req, res) => {
  res.status(202).json({ received: true });
});

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
