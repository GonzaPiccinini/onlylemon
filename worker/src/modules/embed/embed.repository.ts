import { prisma } from '../../persistence/prisma/client.js';

/**
 * Public-only Prisma select for embed bundle generation.
 *
 * SECURITY: accessToken is NEVER included at any level of this select.
 * Only fields required by the embed bundle are projected.
 */
export const EMBED_SELECT = {
  id: true,
  status: true,
  whatsappMessages: true,
  metaPixelRelation: {
    select: {
      pixelId: true,
    },
  },
} as const;

export type EmbedLandingRow = {
  id: string;
  status: 'ACTIVE' | 'DISABLED';
  whatsappMessages: string[];
  metaPixelRelation: { pixelId: string } | null;
};

/**
 * Returns public-only landing data for embed bundle generation.
 *
 * Uses an explicit select that structurally excludes accessToken.
 * Returns null if the landingId does not exist in the database.
 */
export const getEmbedConfigByLandingId = async (
  landingId: string,
): Promise<EmbedLandingRow | null> => {
  const result = await prisma.landing.findUnique({
    where: { id: landingId },
    select: EMBED_SELECT,
  });

  if (!result) return null;

  return {
    id: result.id,
    status: result.status as 'ACTIVE' | 'DISABLED',
    whatsappMessages: result.whatsappMessages,
    metaPixelRelation: result.metaPixelRelation ?? null,
  };
};
