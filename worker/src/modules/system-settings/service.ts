/**
 * system-settings/service.ts
 *
 * Thin service layer over the SystemSetting repository.
 *
 * Design decision (locked): missing key → return empty string "".
 * This lets callers treat "" as "feature disabled" without null checks.
 *
 * Validation (length 1-200 chars) lives in the CONTROLLER, not here —
 * the service accepts any string value, boundary validation is the
 * controller's responsibility (mirrors existing admin module patterns).
 */

import { getByKey, upsert } from './repository.js';

/**
 * Returns the setting value for `key`, or `""` when the key is missing.
 */
export const getSetting = async (key: string): Promise<string> => {
  const value = await getByKey(key);
  return value ?? '';
};

/**
 * Upserts the setting value for `key`.
 * Validation is the caller's responsibility.
 */
export const upsertSetting = async (key: string, value: string): Promise<void> => {
  await upsert(key, value);
};
