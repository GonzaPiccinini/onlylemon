/**
 * system-settings/routes.ts
 *
 * Express router for the SystemSetting admin endpoints.
 * Mounted by admin.routes.ts under `/api/admin/settings` so the full paths are:
 *   GET  /api/admin/settings/auto-conversion-trigger-phrase
 *   PUT  /api/admin/settings/auto-conversion-trigger-phrase
 *
 * The admin auth guard (requireAuth + requireRole) is applied by the parent
 * adminRouter.use() call in admin.routes.ts, so it covers these routes too.
 */

/**
 * system-settings/routes.ts
 *
 * Express router for the SystemSetting admin endpoints.
 * Mounted by admin.routes.ts under `/api/admin/settings` so the full paths are:
 *   GET  /api/admin/settings/:key  (key must be in ALL_SETTING_KEYS)
 *   PUT  /api/admin/settings/:key  (key must be in ALL_SETTING_KEYS)
 *
 * Legacy specific routes kept for backwards compatibility with existing
 * dashboard code that hits `/auto-conversion-trigger-phrase` directly.
 *
 * The admin auth guard (requireAuth + requireRole) is applied by the parent
 * adminRouter.use() call in admin.routes.ts, so it covers these routes too.
 */

import { Router } from 'express';
import {
  getAutoConversionTriggerHandler,
  updateAutoConversionTriggerHandler,
  getSettingHandler,
  updateSettingHandler,
} from './controller.js';

export const systemSettingsRouter = Router();

// Legacy specific routes — kept for backwards compatibility
systemSettingsRouter.get(
  '/auto-conversion-trigger-phrase',
  getAutoConversionTriggerHandler,
);

systemSettingsRouter.put(
  '/auto-conversion-trigger-phrase',
  updateAutoConversionTriggerHandler,
);

// Generic routes — support any valid SettingKey
systemSettingsRouter.get('/:key', getSettingHandler);
systemSettingsRouter.put('/:key', updateSettingHandler);
