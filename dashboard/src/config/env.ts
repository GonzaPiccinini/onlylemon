const normalizeSlash = (value: string): string => {
  if (value.endsWith("/")) {
    return value.slice(0, -1);
  }

  return value;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === "true";
};

export const env = {
  apiBaseUrl: normalizeSlash(
    import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api",
  ),
  useMocks: parseBoolean(import.meta.env.VITE_USE_MOCKS, true),
  mockDelayMs: Number(import.meta.env.VITE_MOCK_DELAY_MS ?? 450),
};
