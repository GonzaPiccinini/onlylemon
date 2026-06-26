import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
}

export const verifyTurnstileToken = async (
  token: string,
  remoteIp?: string,
): Promise<boolean> => {
  const params = new URLSearchParams({
    secret: config.TURNSTILE_SECRET_KEY,
    response: token,
  });

  if (remoteIp) {
    params.set('remoteip', remoteIp);
  }

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = (await res.json()) as TurnstileResponse;
    return data.success === true;
  } catch (err) {
    logger.error({ err }, 'Turnstile verification request failed');
    return false;
  }
};
