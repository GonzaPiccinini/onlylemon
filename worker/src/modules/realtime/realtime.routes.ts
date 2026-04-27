import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import type { AuthenticatedUser } from '../../types/api.js';
import {
  getCashierRuntimeStateService,
} from '../cashier/cashier.service.js';
import {
  subscribeCashierRuntimeStateChanged,
} from '../cashier/runtime-events.js';

export const realtimeRouter = Router();

realtimeRouter.get('/cashier/runtime-state/stream', async (req, res) => {
  const rawToken =
    typeof req.query.token === 'string'
      ? req.query.token
      : req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? null;

  if (!rawToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let authUser: AuthenticatedUser;
  try {
    authUser = jwt.verify(rawToken, config.JWT_SECRET) as AuthenticatedUser;
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (authUser.role !== 'CASHIER' || !authUser.cashierId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const cashierId = authUser.cashierId;

  let initialRuntime;
  try {
    initialRuntime = await getCashierRuntimeStateService(cashierId);
  } catch (err) {
    logger.error({ err, cashierId }, 'sse runtime-state initial fetch failed');
    return res.status(500).json({ error: 'Internal server error' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const writeEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  writeEvent('runtime-state', initialRuntime);

  const pushRuntimeState = async () => {
    try {
      const runtime = await getCashierRuntimeStateService(cashierId);
      writeEvent('runtime-state', runtime);
    } catch (err) {
      logger.warn({ err, cashierId }, 'sse runtime-state refresh failed');
    }
  };

  const unsubscribe = subscribeCashierRuntimeStateChanged(cashierId, () => {
    void pushRuntimeState();
  });

  const heartbeat = setInterval(() => {
    writeEvent('ping', Date.now());
  }, 20_000);

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(heartbeat);
    unsubscribe();
  };

  req.on('close', cleanup);
  res.on('error', (err) => {
    logger.warn({ err, cashierId }, 'sse runtime-state response error');
    cleanup();
  });
});
