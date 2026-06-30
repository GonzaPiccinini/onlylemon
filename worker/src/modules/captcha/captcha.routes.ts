import { Router, type Request, type Response } from 'express';
import { createAltchaChallenge } from '../../integrations/altcha.js';
import { logger } from '../../lib/logger.js';

export const captchaRouter = Router();

/**
 * GET /altcha/challenge
 *
 * Public endpoint — returns a signed Altcha proof-of-work challenge.
 * No CORS gating: the challenge is served as a plain JSON resource,
 * consumed synchronously by the embed script via fetch.
 * The HMAC secret (ALTCHA_HMAC_SECRET) is NEVER included in the response.
 */
captchaRouter.get('/challenge', async (_req: Request, res: Response) => {
  try {
    const challenge = await createAltchaChallenge();
    res.json(challenge);
  } catch (err) {
    logger.error({ err }, 'Failed to create Altcha challenge');
    res.status(500).json({ message: 'Failed to create challenge' });
  }
});
