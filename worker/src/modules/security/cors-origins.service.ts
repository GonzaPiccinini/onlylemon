import { config } from '../../config/env.js';
import { listActiveLandingUrls } from '../admin/admin.repository.js';

const normalizeOrigin = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).origin.toLowerCase();
  } catch {
    return null;
  }
};

const parseStaticOrigins = (): {
  allowAll: boolean;
  origins: Set<string>;
} => {
  const raw = config.CORS_ORIGIN.trim();
  if (!raw || raw === '*') {
    return {
      allowAll: true,
      origins: new Set(),
    };
  }

  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.includes('*')) {
    return {
      allowAll: true,
      origins: new Set(),
    };
  }

  const origins = new Set<string>();
  for (const item of items) {
    const normalized = normalizeOrigin(item);
    if (normalized) {
      origins.add(normalized);
    }
  }

  return {
    allowAll: false,
    origins,
  };
};

export const isCorsOriginAllowed = async (
  origin: string | undefined,
): Promise<boolean> => {
  if (!origin) {
    return true;
  }

  const normalizedRequestOrigin = normalizeOrigin(origin);
  if (!normalizedRequestOrigin) {
    return false;
  }

  const staticOrigins = parseStaticOrigins();
  if (staticOrigins.allowAll || staticOrigins.origins.has(normalizedRequestOrigin)) {
    return true;
  }

  const landingUrls = await listActiveLandingUrls();
  const activeLandingOrigins = new Set<string>();

  for (const landing of landingUrls) {
    const normalized = normalizeOrigin(landing.url);
    if (normalized) {
      activeLandingOrigins.add(normalized);
    }
  }

  return activeLandingOrigins.has(normalizedRequestOrigin);
};
