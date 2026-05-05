import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.logLevel,
  base: { service: 'gateway' },
  redact: ['req.headers.authorization', `req.headers["x-webhook-token"]`],
});
