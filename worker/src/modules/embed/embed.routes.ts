import { Router } from 'express';
import { embedController } from './embed.controller.js';

/**
 * Embed router — serves self-contained JS bundles per landing.
 *
 * Registered at: app.use('/embed', embedRouter)
 * Effective route: GET /embed/:landingId.js
 *
 * Public GET, no CORS gating — the embed is a classic script tag resource.
 * The sensitive API surface (POST /api/leads) is CORS-gated separately.
 *
 * path-to-regexp (Express 4) escapes the literal dot in /:landingId.js so
 * only requests ending in exactly ".js" will match.
 */
export const embedRouter = Router();

embedRouter.get('/:landingId.js', embedController);
