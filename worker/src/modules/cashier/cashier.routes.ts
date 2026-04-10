import { Router } from 'express';
import { requireAuth, requireRole } from '../security/auth.middleware.js';
import {
  currentSessionHandler,
  finishSessionHandler,
  leadsListHandler,
  listSessionsHandler,
  queueConvertLeadHandler,
  queueCurrentLeadHandler,
  queueSkipLeadHandler,
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

cashierRouter.get('/leads/queue/current', queueCurrentLeadHandler);
cashierRouter.post('/leads/:leadId/convert', queueConvertLeadHandler);
cashierRouter.post('/leads/:leadId/skip', queueSkipLeadHandler);
cashierRouter.get('/leads', leadsListHandler);
cashierRouter.patch('/account', updateAccountHandler);

cashierRouter.get('/whatsapp/link-state', whatsappLinkStateHandler);
cashierRouter.post('/whatsapp/link/start', whatsappLinkStartHandler);
cashierRouter.post('/whatsapp/link/refresh', whatsappLinkRefreshHandler);
cashierRouter.post('/whatsapp/link/reset', whatsappLinkResetHandler);
cashierRouter.get('/whatsapp/link/status', whatsappLinkStatusHandler);
cashierRouter.post('/whatsapp/link/complete', whatsappLinkCompleteHandler);
