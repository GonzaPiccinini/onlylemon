import { Router } from 'express';
import {
  cashierStatsHandler,
  createAdminHandler,
  createCashierHandler,
  createCashierSessionHandler,
  createLandingHandler,
  createLandingFallbackPhoneHandler,
  createMetaPixelHandler,
  deleteCashierSessionHandler,
  deleteLandingFallbackPhoneHandler,
  deleteMetaPixelHandler,
  disableCashierHandler,
  enableCashierHandler,
  disableLandingHandler,
  enableLandingHandler,
  finishCashierWorkSessionHandler,
  fundsSeriesHandler,
  getAdminConversionsTotalsHandler,
  getLandingSessionsHandler,
  getLeadHistoryHandler,
  getMetaPixelHandler,
  getSessionLandingsHandler,
  listAdminConversionsHandler,
  listAdminsHandler,
  listCashierSessionsHandler,
  listCashiersHandler,
  listLandingFallbackPhonesHandler,
  listLandingsHandler,
  listLeadsHandler,
  listMetaPixelsHandler,
  replaceSessionLandingsHandler,
  setAdminStatusHandler,
  startWhatsappLinkForSessionAdminHandler,
  summaryHandler,
  updateAdminAccountHandler,
  updateAdminHandler,
  updateCashierHandler,
  updateCashierMaxSessionsHandler,
  updateLandingHandler,
  updateLandingFallbackPhoneHandler,
  updateMetaPixelHandler,
} from './admin.controller.js';
import { requireAuth, requireRole } from '../security/auth.middleware.js';
import { systemSettingsRouter } from '../system-settings/routes.js';

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
// E6: PATCH /cashiers/:cashierId to update maxSessions
adminRouter.patch('/cashiers/:cashierId', updateCashierMaxSessionsHandler);
adminRouter.patch('/cashiers/:cashierId/disable', disableCashierHandler);
adminRouter.patch('/cashiers/:cashierId/enable', enableCashierHandler);
adminRouter.post(
  '/cashiers/:cashierId/sessions/finish',
  finishCashierWorkSessionHandler,
);
// E1: list sessions for a cashier
adminRouter.get('/cashiers/:cashierId/whatsapp-sessions', listCashierSessionsHandler);
// E2: create session for a cashier
adminRouter.post('/cashiers/:cashierId/whatsapp-sessions', createCashierSessionHandler);
// E3: delete a session
adminRouter.delete('/whatsapp-sessions/:sessionId', deleteCashierSessionHandler);
// E4a: get landings for a session
adminRouter.get('/whatsapp-sessions/:sessionId/landings', getSessionLandingsHandler);
// E4b: replace landings for a session
adminRouter.put('/whatsapp-sessions/:sessionId/landings', replaceSessionLandingsHandler);
// Admin "Generar QR ahora": initiate QR/pairing flow for any session
adminRouter.post('/whatsapp-sessions/:sessionId/link', startWhatsappLinkForSessionAdminHandler);

adminRouter.get('/landings', listLandingsHandler);
adminRouter.post('/landings', createLandingHandler);
adminRouter.put('/landings/:landingId', updateLandingHandler);
adminRouter.patch('/landings/:landingId/disable', disableLandingHandler);
adminRouter.patch('/landings/:landingId/enable', enableLandingHandler);
// E5: get sessions bound to a landing (for landing-side binding UI)
adminRouter.get('/landings/:landingId/sessions', getLandingSessionsHandler);

// 3.4 — MetaPixel CRUD (token never returned in responses)
adminRouter.get('/meta-pixels', listMetaPixelsHandler);
adminRouter.post('/meta-pixels', createMetaPixelHandler);
adminRouter.get('/meta-pixels/:id', getMetaPixelHandler);
adminRouter.put('/meta-pixels/:id', updateMetaPixelHandler);
adminRouter.delete('/meta-pixels/:id', deleteMetaPixelHandler);

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

// System settings — mounted under /settings; inherits admin auth guard above
adminRouter.use('/settings', systemSettingsRouter);
