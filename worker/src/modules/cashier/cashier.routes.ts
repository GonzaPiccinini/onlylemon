import { Router } from 'express';
import { requireAuth, requireRole } from '../security/auth.middleware.js';
import {
  addFundsHandler,
  addFundsHistoryHandler,
  clientPhonesHandler,
  currentSessionHandler,
  finishSessionHandler,
  listSessionsHandler,
  startSessionHandler,
} from './cashier.controller.js';

export const cashierRouter = Router();

cashierRouter.use(requireAuth, requireRole('CASHIER'));

cashierRouter.get('/sessions', listSessionsHandler);
cashierRouter.get('/sessions/current', currentSessionHandler);
cashierRouter.post('/sessions/start', startSessionHandler);
cashierRouter.post('/sessions/finish', finishSessionHandler);

cashierRouter.get('/client-phones', clientPhonesHandler);
cashierRouter.post('/add-funds', addFundsHandler);
cashierRouter.get('/add-funds/history', addFundsHistoryHandler);
