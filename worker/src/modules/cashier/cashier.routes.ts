import { Router } from 'express';
import { requireAuth, requireRole } from '../security/auth.middleware.js';
import {
  cashierRuntimeStateHandler,
  createConversionHandler,
  currentSessionHandler,
  finishSessionHandler,
  leadsListHandler,
  listCashierConversionsHandler,
  listSessionsHandler,
  searchCashierLeadsHandler,
  startSessionHandler,
  updateAccountHandler,
  whatsappLinkCompleteHandler,
  whatsappLinkRefreshHandler,
  whatsappLinkResetHandler,
  whatsappLinkStartHandler,
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
cashierRouter.get('/leads', leadsListHandler);
cashierRouter.get('/conversions', listCashierConversionsHandler);
cashierRouter.get('/runtime-state', cashierRuntimeStateHandler);
cashierRouter.patch('/account', updateAccountHandler);

cashierRouter.get('/whatsapp/link-state', whatsappLinkStateHandler);
cashierRouter.post('/whatsapp/link/start', whatsappLinkStartHandler);
cashierRouter.post('/whatsapp/link/refresh', whatsappLinkRefreshHandler);
cashierRouter.post('/whatsapp/link/reset', whatsappLinkResetHandler);
cashierRouter.get('/whatsapp/link/status', whatsappLinkStatusHandler);
cashierRouter.post('/whatsapp/link/complete', whatsappLinkCompleteHandler);
