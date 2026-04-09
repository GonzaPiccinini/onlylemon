import { Router } from 'express';
import {
  cashierStatsHandler,
  createCashierHandler,
  createLandingHandler,
  disableCashierHandler,
  disableLandingHandler,
  enableLandingHandler,
  fundsSeriesHandler,
  listCashierLandingsHandler,
  listCashiersHandler,
  listLandingsHandler,
  replaceCashierLandingsHandler,
  summaryHandler,
  updateLandingHandler,
  updateCashierHandler,
} from './admin.controller.js';
import { requireAuth, requireRole } from '../security/auth.middleware.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('ADMIN'));

adminRouter.get('/cashiers', listCashiersHandler);
adminRouter.post('/cashiers', createCashierHandler);
adminRouter.put('/cashiers/:cashierId', updateCashierHandler);
adminRouter.patch('/cashiers/:cashierId/disable', disableCashierHandler);
adminRouter.get('/cashiers/:cashierId/landings', listCashierLandingsHandler);
adminRouter.put('/cashiers/:cashierId/landings', replaceCashierLandingsHandler);

adminRouter.get('/landings', listLandingsHandler);
adminRouter.post('/landings', createLandingHandler);
adminRouter.put('/landings/:landingId', updateLandingHandler);
adminRouter.patch('/landings/:landingId/disable', disableLandingHandler);
adminRouter.patch('/landings/:landingId/enable', enableLandingHandler);

adminRouter.get('/stats/summary', summaryHandler);
adminRouter.get('/stats/cashiers', cashierStatsHandler);
adminRouter.get('/stats/funds-series', fundsSeriesHandler);
