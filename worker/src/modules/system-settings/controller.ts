/**
 * system-settings/controller.ts
 *
 * Express request handlers for the SystemSetting admin endpoints:
 *   GET  /api/admin/settings/auto-conversion-trigger-phrase
 *   PUT  /api/admin/settings/auto-conversion-trigger-phrase
 *
 * Validation (Zod) lives here at the boundary — the service accepts any string.
 * Auth (401) is enforced upstream by the admin router middleware (requireAuth guard).
 *
 * Exports both production-wired handlers AND injectable factories for unit testing
 * (mirrors the deleteLandingFallbackPhoneHandlerImpl pattern in admin.controller.ts).
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { getSetting, upsertSetting } from './service.js';
import { SETTING_KEYS, ALL_SETTING_KEYS } from './keys.js';
import type { SettingKey } from './keys.js';

// ---------------------------------------------------------------------------
// Zod schema for PUT body
// ---------------------------------------------------------------------------

const updateTriggerPhraseSchema = z.object({
  value: z.string().min(1).max(200),
});

// ---------------------------------------------------------------------------
// Injectable factories (used in unit tests)
// ---------------------------------------------------------------------------

type GetDeps = {
  getSettingFn: (key: string) => Promise<string>;
};

type UpdateDeps = {
  upsertSettingFn: (key: string, value: string) => Promise<void>;
};

export const makeGetAutoConversionTriggerHandler =
  (deps: GetDeps) => async (_req: Request, res: Response) => {
    const value = await deps.getSettingFn(SETTING_KEYS.AUTO_CONVERSION_TRIGGER_PHRASE);
    return res.status(200).json({ value });
  };

export const makeUpdateAutoConversionTriggerHandler =
  (deps: UpdateDeps) => async (req: Request, res: Response) => {
    const parsed = updateTriggerPhraseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: parsed.error.flatten(),
      });
    }

    await deps.upsertSettingFn(SETTING_KEYS.AUTO_CONVERSION_TRIGGER_PHRASE, parsed.data.value);
    return res.status(200).json({ value: parsed.data.value });
  };

// ---------------------------------------------------------------------------
// Generic /:key handlers (Item #6 — supports any valid SettingKey)
// ---------------------------------------------------------------------------

type GenericGetDeps = {
  getSettingFn: (key: string) => Promise<string>;
};

type GenericUpdateDeps = {
  upsertSettingFn: (key: string, value: string) => Promise<void>;
};

function isValidSettingKey(key: string): key is SettingKey {
  return (ALL_SETTING_KEYS as readonly string[]).includes(key);
}

export const makeGetSettingHandler =
  (deps: GenericGetDeps) => async (req: Request, res: Response) => {
    const { key } = req.params;
    if (!isValidSettingKey(key)) {
      return res.status(404).json({ error: `Unknown setting key: ${key}` });
    }
    const value = await deps.getSettingFn(key);
    return res.status(200).json({ value });
  };

export const makeUpdateSettingHandler =
  (deps: GenericUpdateDeps) => async (req: Request, res: Response) => {
    const { key } = req.params;
    if (!isValidSettingKey(key)) {
      return res.status(404).json({ error: `Unknown setting key: ${key}` });
    }
    const parsed = z.object({ value: z.string().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: parsed.error.flatten(),
      });
    }
    await deps.upsertSettingFn(key, parsed.data.value);
    return res.status(200).json({ value: parsed.data.value });
  };

// ---------------------------------------------------------------------------
// Production-wired handlers (use real service)
// ---------------------------------------------------------------------------

export const getAutoConversionTriggerHandler = makeGetAutoConversionTriggerHandler({
  getSettingFn: getSetting,
});

export const updateAutoConversionTriggerHandler = makeUpdateAutoConversionTriggerHandler({
  upsertSettingFn: upsertSetting,
});

export const getSettingHandler = makeGetSettingHandler({
  getSettingFn: getSetting,
});

export const updateSettingHandler = makeUpdateSettingHandler({
  upsertSettingFn: upsertSetting,
});
