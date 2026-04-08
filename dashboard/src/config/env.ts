const normalizeSlash = (value: string): string => {
  if (value.endsWith("/")) {
    return value.slice(0, -1);
  }

  return value;
};

export const env = {
  apiBaseUrl: normalizeSlash(
    import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3002/api",
  ),
};
