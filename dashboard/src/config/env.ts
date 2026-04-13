const normalizeSlash = (value: string): string => {
  if (value.endsWith("/")) {
    return value.slice(0, -1);
  }

  return value;
};

const defaultApiBaseUrl = (): string => {
  if (typeof window === "undefined") {
    return "http://localhost:3002/api";
  }

  return `${window.location.protocol}//${window.location.hostname}:3002/api`;
};

const normalizeForRemoteDevice = (value: string): string => {
  if (typeof window === "undefined") {
    return value;
  }

  const currentHost = window.location.hostname;
  if (!currentHost || currentHost === "localhost" || currentHost === "127.0.0.1") {
    return value;
  }

  try {
    const parsed = new URL(value);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      parsed.hostname = currentHost;
      return parsed.toString().replace(/\/$/, "");
    }
  } catch {
    return value;
  }

  return value;
};

const apiBaseUrl = normalizeForRemoteDevice(
  normalizeSlash(import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl()),
);

export const env = {
  apiBaseUrl,
  realtimeBaseUrl: normalizeForRemoteDevice(
    normalizeSlash(
      import.meta.env.VITE_REALTIME_BASE_URL ?? `${apiBaseUrl}/realtime`,
    ),
  ),
};
