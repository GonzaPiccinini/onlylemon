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
import {
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
  SUPPORTED_CURRENCY_CODES,
  getCurrencyMeta,
} from './currencies.js';

// Threshold settings that must hold a positive integer (in the platform currency).
const THRESHOLD_KEYS: readonly string[] = [
  SETTING_KEYS.HIGH_VALUE_THRESHOLD,
  SETTING_KEYS.HIGH_VALUE_TIER1_THRESHOLD,
  SETTING_KEYS.HIGH_VALUE_TIER2_THRESHOLD,
  SETTING_KEYS.HIGH_VALUE_TIER3_THRESHOLD,
];

// ---------------------------------------------------------------------------
// Zod schema for PUT body
// ---------------------------------------------------------------------------

const updateTriggerPhraseSchema = z.object({
  value: z.string().min(1).max(2000),
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
  getSettingFn: (key: string) => Promise<string>;
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
    // Trigger phrase may hold multiple phrases separated by newlines, so it
    // gets a more generous max length than numeric settings.
    const maxLen = key === SETTING_KEYS.AUTO_CONVERSION_TRIGGER_PHRASE ? 2000 : 200;
    const parsed = z.object({ value: z.string().min(1).max(maxLen) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: parsed.error.flatten(),
      });
    }

    const newValue = parsed.data.value;

    // Platform currency must be one of the supported ISO 4217 codes.
    if (key === SETTING_KEYS.PLATFORM_CURRENCY && !isSupportedCurrency(newValue)) {
      return res.status(400).json({
        error: `Divisa no soportada: ${newValue}`,
        allowed: SUPPORTED_CURRENCY_CODES,
      });
    }

    // High-value thresholds must be a positive integer.
    if (THRESHOLD_KEYS.includes(key)) {
      const amount = Number.parseInt(newValue, 10);
      if (!Number.isFinite(amount) || amount <= 0 || String(amount) !== newValue) {
        return res.status(400).json({
          error: 'El umbral debe ser un numero entero positivo',
        });
      }
    }

    const isMin = key === SETTING_KEYS.AUTO_CONVERSION_MIN_AMOUNT;
    const isMax = key === SETTING_KEYS.AUTO_CONVERSION_MAX_AMOUNT;

    if (isMin || isMax) {
      const newAmount = Number.parseInt(newValue, 10);
      if (Number.isFinite(newAmount) && newAmount > 0) {
        const counterpartKey = isMin
          ? SETTING_KEYS.AUTO_CONVERSION_MAX_AMOUNT
          : SETTING_KEYS.AUTO_CONVERSION_MIN_AMOUNT;
        const counterpartRaw = await deps.getSettingFn(counterpartKey);
        const counterpart = Number.parseInt(counterpartRaw, 10);
        if (Number.isFinite(counterpart) && counterpart > 0) {
          const minAmount = isMin ? newAmount : counterpart;
          const maxAmount = isMax ? newAmount : counterpart;
          if (minAmount > maxAmount) {
            return res.status(400).json({
              error: 'El monto mínimo no puede ser mayor al máximo',
            });
          }
        }
      }
    }

    await deps.upsertSettingFn(key, newValue);
    return res.status(200).json({ value: newValue });
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

export const getCurrencyOptionsHandler = (_req: Request, res: Response) =>
  res.status(200).json({ currencies: SUPPORTED_CURRENCIES });

// Active platform currency (code + label + symbol) for any authenticated user.
// Used by the dashboard to render the right symbol next to amounts; readable by
// cashiers too, unlike the admin-only setting endpoints.
export const makeGetActiveCurrencyHandler =
  (deps: GenericGetDeps) => async (_req: Request, res: Response) => {
    const code = await deps.getSettingFn(SETTING_KEYS.PLATFORM_CURRENCY);
    return res.status(200).json(getCurrencyMeta(code));
  };

export const getActiveCurrencyHandler = makeGetActiveCurrencyHandler({
  getSettingFn: getSetting,
});

export const getSettingHandler = makeGetSettingHandler({
  getSettingFn: getSetting,
});

export const updateSettingHandler = makeUpdateSettingHandler({
  upsertSettingFn: upsertSetting,
  getSettingFn: getSetting,
});
