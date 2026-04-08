import { createHash } from 'node:crypto';

export const hashPassword = (password: string): string =>
  createHash('sha256').update(password).digest('hex');

export const isPasswordValid = (password: string, storedHash: string): boolean =>
  hashPassword(password) === storedHash;
