import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';
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

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendRuntimeState = async () => {
    const runtime = await getCashierRuntimeStateService(authUser.cashierId as string);
    res.write(`event: runtime-state\n`);
    res.write(`data: ${JSON.stringify(runtime)}\n\n`);
  };

  await sendRuntimeState();

  const unsubscribe = subscribeCashierRuntimeStateChanged(
    authUser.cashierId,
    () => {
      void sendRuntimeState();
    },
  );

  const heartbeat = setInterval(() => {
    res.write('event: ping\n');
    res.write(`data: ${Date.now()}\n\n`);
  }, 20_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});
