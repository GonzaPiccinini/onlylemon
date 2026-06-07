/**
 * system-settings/public-routes.ts
 *
 * Settings readable by ANY authenticated user (admins and cashiers alike),
 * unlike the admin-only mutation endpoints in routes.ts.
 *
 * Mounted at /api/settings by server.ts:
 *   GET /api/settings/currency → { code, label, symbol } of the active currency
 *
 * The dashboard uses this to render the correct currency symbol next to amounts
 * on every page, including cashier views that cannot reach /api/admin/*.
 */

import { Router } from 'express';
import { requireAuth } from '../security/auth.middleware.js';
import { getActiveCurrencyHandler } from './controller.js';

export const publicSettingsRouter = Router();

publicSettingsRouter.use(requireAuth);

publicSettingsRouter.get('/currency', getActiveCurrencyHandler);
