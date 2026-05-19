/**
 * system-settings/repository.ts
 *
 * Prisma-backed persistence for the SystemSetting table.
 * Exposes two operations: getByKey (read) and upsert (write).
 */

import { prisma } from '../../persistence/prisma/client.js';

/**
 * Returns the value stored for `key`, or `null` if the row does not exist.
 */
export const getByKey = async (key: string): Promise<string | null> => {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row ? row.value : null;
};

/**
 * Inserts the (key, value) pair or updates `value` (and `updatedAt`) if the key
 * already exists.
 */
export const upsert = async (key: string, value: string): Promise<void> => {
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value, updatedAt: new Date() },
    create: { key, value },
  });
};
