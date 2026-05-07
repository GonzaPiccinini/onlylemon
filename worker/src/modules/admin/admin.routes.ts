import { Router } from 'express';
import {
  cashierStatsHandler,
  createAdminHandler,
  createCashierHandler,
  createLandingHandler,
  disableCashierHandler,
  enableCashierHandler,
  disableLandingHandler,
  enableLandingHandler,
  finishCashierWorkSessionHandler,
  fundsSeriesHandler,
  listAdminConversionsHandler,
  listAdminsHandler,
  listLeadsHandler,
  listCashierLandingsHandler,
  listCashiersHandler,
  listLandingsHandler,
  replaceCashierLandingsHandler,
  setAdminStatusHandler,
  summaryHandler,
  updateAdminAccountHandler,
  updateAdminHandler,
  updateLandingHandler,
  updateCashierHandler,
} from './admin.controller.js';
import { requireAuth, requireRole } from '../security/auth.middleware.js';

export const adminRouter = Router();

// Widen from ADMIN to ADMIN+SUPER_ADMIN (REQ-AUTHZ-SUPERSET-1)
adminRouter.use(requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'));

// SUPER_ADMIN-only: admin CRUD
adminRouter.get('/admins', requireRole('SUPER_ADMIN'), listAdminsHandler);
adminRouter.post('/admins', requireRole('SUPER_ADMIN'), createAdminHandler);
adminRouter.patch('/admins/:adminId', requireRole('SUPER_ADMIN'), updateAdminHandler);
adminRouter.patch('/admins/:adminId/status', requireRole('SUPER_ADMIN'), setAdminStatusHandler);

adminRouter.patch('/account', updateAdminAccountHandler);

adminRouter.get('/cashiers', listCashiersHandler);
adminRouter.post('/cashiers', createCashierHandler);
adminRouter.put('/cashiers/:cashierId', updateCashierHandler);
adminRouter.patch('/cashiers/:cashierId/disable', disableCashierHandler);
adminRouter.patch('/cashiers/:cashierId/enable', enableCashierHandler);
adminRouter.post(
  '/cashiers/:cashierId/sessions/finish',
  finishCashierWorkSessionHandler,
);
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
adminRouter.get('/leads', listLeadsHandler);
adminRouter.get('/conversions', listAdminConversionsHandler);
