import { Router } from 'express';
import {
  cashierStatsHandler,
  createCashierHandler,
  disableCashierHandler,
  fundsSeriesHandler,
  listCashiersHandler,
  summaryHandler,
  updateCashierHandler,
} from './admin.controller.js';
import { requireAuth, requireRole } from '../security/auth.middleware.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('ADMIN'));

adminRouter.get('/cashiers', listCashiersHandler);
adminRouter.post('/cashiers', createCashierHandler);
adminRouter.put('/cashiers/:cashierId', updateCashierHandler);
adminRouter.patch('/cashiers/:cashierId/disable', disableCashierHandler);

adminRouter.get('/stats/summary', summaryHandler);
adminRouter.get('/stats/cashiers', cashierStatsHandler);
adminRouter.get('/stats/funds-series', fundsSeriesHandler);
