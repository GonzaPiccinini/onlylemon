/**
 * system-settings/keys.ts
 *
 * Canonical setting key constants and union type for type-safe access.
 * Add new keys here as new features require them.
 */

export const SETTING_KEYS = {
  AUTO_CONVERSION_TRIGGER_PHRASE: 'auto_conversion_trigger_phrase',
  AUTO_CONVERSION_MIN_AMOUNT: 'auto_conversion_min_amount',
  AUTO_CONVERSION_MAX_AMOUNT: 'auto_conversion_max_amount',
  // Platform-wide currency (ISO 4217) sent to Meta on money events.
  PLATFORM_CURRENCY: 'platform_currency',
  // High-value tier thresholds (in the platform currency) used by
  // sendMetaConversion to decide which HighValue* events to fire.
  HIGH_VALUE_THRESHOLD: 'high_value_threshold',
  HIGH_VALUE_TIER1_THRESHOLD: 'high_value_tier1_threshold',
  HIGH_VALUE_TIER2_THRESHOLD: 'high_value_tier2_threshold',
  HIGH_VALUE_TIER3_THRESHOLD: 'high_value_tier3_threshold',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/** All valid setting key values — used for runtime validation in routes */
export const ALL_SETTING_KEYS: readonly SettingKey[] = Object.values(SETTING_KEYS);
