import type { Request, Response } from 'express';
import { getEmbedConfigByLandingId, type EmbedLandingRow } from './embed.repository.js';
import { renderEmbedBundle, computeEmbedETag } from './bundle.js';

/** UUID v4 format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EmbedControllerDeps = {
  getConfig: (landingId: string) => Promise<EmbedLandingRow | null>;
};

/**
 * Factory that creates the embed controller with injectable dependencies.
 * Used for unit testing with a mocked repository.
 */
export function createEmbedController(deps: EmbedControllerDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const { landingId } = req.params;

    // Defensive UUID validation — the route /:landingId.js may accept non-UUID
    // strings if regex is not applied at the router level.
    if (!UUID_RE.test(landingId)) {
      res.status(404).send();
      return;
    }

    const config = await deps.getConfig(landingId);

    if (!config || config.status !== 'ACTIVE') {
      res.status(404).send();
      return;
    }

    // Landing must have a pixel configured — no pixel means embed is not ready
    if (!config.metaPixelRelation) {
      res.status(404).send();
      return;
    }

    const embedConfig = {
      landingId: config.id,
      pixelId: config.metaPixelRelation.pixelId,
      messages: config.whatsappMessages,
    };

    const etag = computeEmbedETag(embedConfig);
    const bundle = renderEmbedBundle(embedConfig);

    res
      .set('Content-Type', 'application/javascript; charset=utf-8')
      .set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
      .set('ETag', etag)
      .status(200)
      .send(bundle);
  };
}

/**
 * Default embed controller instance wired to the real repository.
 * Registered in server.ts under GET /embed/:landingId.js
 */
export const embedController = createEmbedController({
  getConfig: getEmbedConfigByLandingId,
});
