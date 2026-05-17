import { Router } from 'express';
import { requireAuth, requireRole } from '../security/auth.middleware.js';
import {
  cashierRuntimeStateHandler,
  createConversionHandler,
  createMySessionHandler,
  currentSessionHandler,
  deleteMySessionHandler,
  finishSessionHandler,
  getMySessionStatusHandler,
  linkMySessionHandler,
  listCashierConversionsHandler,
  listMySessionsHandler,
  listSessionsHandler,
  refreshMySessionHandler,
  resetMySessionRefreshHandler,
  searchCashierLeadsHandler,
  startSessionHandler,
  updateAccountHandler,
  whatsappLinkCompleteHandler,
  whatsappLinkResetHandler,
  whatsappLinkStateHandler,
  whatsappLinkStatusHandler,
} from './cashier.controller.js';

export const cashierRouter = Router();

cashierRouter.use(requireAuth, requireRole('CASHIER'));

cashierRouter.get('/sessions', listSessionsHandler);
cashierRouter.get('/sessions/current', currentSessionHandler);
cashierRouter.post('/sessions/start', startSessionHandler);
cashierRouter.post('/sessions/finish', finishSessionHandler);

cashierRouter.get('/leads/search', searchCashierLeadsHandler);
cashierRouter.post('/leads/:leadId/convert', createConversionHandler);
cashierRouter.get('/conversions', listCashierConversionsHandler);
cashierRouter.get('/runtime-state', cashierRuntimeStateHandler);
cashierRouter.patch('/account', updateAccountHandler);

cashierRouter.get('/whatsapp/link-state', whatsappLinkStateHandler);
cashierRouter.post('/whatsapp/link/reset', whatsappLinkResetHandler);
cashierRouter.get('/whatsapp/link/status', whatsappLinkStatusHandler);
cashierRouter.post('/whatsapp/link/complete', whatsappLinkCompleteHandler);

// Batch 5 — per-session cashier-scoped routes
cashierRouter.get('/me/sessions', listMySessionsHandler);
cashierRouter.post('/me/sessions', createMySessionHandler);
cashierRouter.delete('/me/sessions/:id', deleteMySessionHandler);
cashierRouter.post('/me/sessions/:id/link', linkMySessionHandler);
cashierRouter.post('/me/sessions/:id/refresh', refreshMySessionHandler);
cashierRouter.post('/me/sessions/:id/reset-refresh', resetMySessionRefreshHandler);
cashierRouter.get('/me/sessions/:id/status', getMySessionStatusHandler);
