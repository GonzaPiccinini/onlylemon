import express from 'express';

import { config } from './config.js';
// import { worker } from './worker.js';

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post('/receive', (_req, res) => {
  res.status(202).json({ received: true });
});

const server = app.listen(config.PORT, () => {
  console.log(`server listening on ${config.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`shutdown signal: ${signal}`);
  // await worker.close();
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
