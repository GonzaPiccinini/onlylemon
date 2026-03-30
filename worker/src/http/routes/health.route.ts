import { Router } from 'express';

import { prisma } from '../../core/prisma.js';
import { isWorkerReady } from '../../worker/state.js';

export const healthRouter = Router();

healthRouter.get('/live', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

healthRouter.get('/ready', async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    if (!isWorkerReady()) {
      res.status(503).json({ status: 'not_ready' });
      return;
    }

    res.status(200).json({ status: 'ready' });
  } catch (error) {
    next(error);
  }
});
