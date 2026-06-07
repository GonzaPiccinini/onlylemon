/**
 * system-settings/conversion-config.ts
 *
 * Resolves the platform currency + high-value thresholds from SystemSetting
 * into the ConversionConfig that sendMetaConversion consumes.
 *
 * Every field falls back to DEFAULT_CONVERSION_CONFIG when its setting is
 * unset (service returns "") or holds an invalid value, so a fresh database
 * behaves exactly like the previous hardcoded ARS implementation.
 *
 * Exposes an injectable factory (makeLoadConversionConfig) for unit testing
 * plus a production-wired loadConversionConfig — same DI pattern as controller.ts.
 */

import { getSetting } from './service.js';
import { SETTING_KEYS } from './keys.js';
import { isSupportedCurrency } from './currencies.js';
import {
  DEFAULT_CONVERSION_CONFIG,
  type ConversionConfig,
} from '../../integrations/leads/conversion.js';

const parsePositiveInt = (raw: string, fallback: number): number => {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const resolveCurrency = (raw: string): string =>
  isSupportedCurrency(raw) ? raw : DEFAULT_CONVERSION_CONFIG.currency;

type LoadDeps = {
  getSettingFn: (key: string) => Promise<string>;
};

/**
 * Reads the 5 conversion settings in one pass and returns a fully-resolved,
 * validated ConversionConfig (never throws — always returns usable values).
 */
export const makeLoadConversionConfig =
  (deps: LoadDeps) => async (): Promise<ConversionConfig> => {
    const [currencyRaw, highValueRaw, tier1Raw, tier2Raw, tier3Raw] =
      await Promise.all([
        deps.getSettingFn(SETTING_KEYS.PLATFORM_CURRENCY),
        deps.getSettingFn(SETTING_KEYS.HIGH_VALUE_THRESHOLD),
        deps.getSettingFn(SETTING_KEYS.HIGH_VALUE_TIER1_THRESHOLD),
        deps.getSettingFn(SETTING_KEYS.HIGH_VALUE_TIER2_THRESHOLD),
        deps.getSettingFn(SETTING_KEYS.HIGH_VALUE_TIER3_THRESHOLD),
      ]);

    const defaults = DEFAULT_CONVERSION_CONFIG.thresholds;

    return {
      currency: resolveCurrency(currencyRaw),
      thresholds: {
        highValue: parsePositiveInt(highValueRaw, defaults.highValue),
        tier1: parsePositiveInt(tier1Raw, defaults.tier1),
        tier2: parsePositiveInt(tier2Raw, defaults.tier2),
        tier3: parsePositiveInt(tier3Raw, defaults.tier3),
      },
    };
  };

export const loadConversionConfig = makeLoadConversionConfig({
  getSettingFn: getSetting,
});
