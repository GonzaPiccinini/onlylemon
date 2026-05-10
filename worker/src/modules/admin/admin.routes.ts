import { Router } from 'express';
import {
  cashierStatsHandler,
  createAdminHandler,
  createCashierHandler,
  createLandingHandler,
  createLandingFallbackPhoneHandler,
  deleteLandingFallbackPhoneHandler,
  disableCashierHandler,
  enableCashierHandler,
  disableLandingHandler,
  enableLandingHandler,
  finishCashierWorkSessionHandler,
  fundsSeriesHandler,
  getAdminConversionsTotalsHandler,
  getLeadHistoryHandler,
  listAdminConversionsHandler,
  listAdminsHandler,
  listLeadsHandler,
  listCashierLandingsHandler,
  listCashiersHandler,
  listLandingFallbackPhonesHandler,
  listLandingsHandler,
  replaceCashierLandingsHandler,
  setAdminStatusHandler,
  summaryHandler,
  updateAdminAccountHandler,
  updateAdminHandler,
  updateLandingHandler,
  updateLandingFallbackPhoneHandler,
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

// Fallback phones CRUD [REQ-3, REQ-4, REQ-5, REQ-6]
adminRouter.get('/landings/:landingId/fallback-phones', listLandingFallbackPhonesHandler);
adminRouter.post('/landings/:landingId/fallback-phones', createLandingFallbackPhoneHandler);
adminRouter.patch('/landings/:landingId/fallback-phones/:id', updateLandingFallbackPhoneHandler);
adminRouter.delete('/landings/:landingId/fallback-phones/:id', deleteLandingFallbackPhoneHandler);

adminRouter.get('/stats/summary', summaryHandler);
adminRouter.get('/stats/cashiers', cashierStatsHandler);
adminRouter.get('/stats/funds-series', fundsSeriesHandler);
adminRouter.get('/leads', listLeadsHandler);
adminRouter.get('/leads/:id/history', getLeadHistoryHandler);
adminRouter.get('/conversions', listAdminConversionsHandler);
// Must precede any future /conversions/:id dynamic route
adminRouter.get('/conversions/totals', getAdminConversionsTotalsHandler);
