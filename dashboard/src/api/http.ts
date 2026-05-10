import axios, { type AxiosError, type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { env } from "@/config/env";
import { endpoints } from "@/api/endpoints";

let accessToken: string | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};

export const http = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 12_000,
});

http.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

export interface ApiError {
  message: string;
  statusCode?: number;
}

export const toApiError = (error: unknown): ApiError => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: string; message?: string }>;
    return {
      message:
        axiosError.response?.data?.message ??
        axiosError.response?.data?.error ??
        axiosError.message,
      statusCode: axiosError.response?.status,
    };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: "Unexpected error" };
};

// ---------------------------------------------------------------------------
// Auth storage helpers (used by interceptor + auth-context in B6)
// ---------------------------------------------------------------------------

export interface AuthStorageValue {
  token: string;
  refreshToken: string | null;
  user: unknown;
}

/** Read auth from localStorage (key: "auth"). Migration from legacy key is handled by auth-context on app boot. */
export const readAuth = (): AuthStorageValue | null => {
  try {
    const raw = localStorage.getItem("auth");
    if (raw) return JSON.parse(raw) as AuthStorageValue;
    return null;
  } catch {
    return null;
  }
};

export const writeAuth = (value: AuthStorageValue): void => {
  localStorage.setItem("auth", JSON.stringify(value));
};

// ---------------------------------------------------------------------------
// 401 response interceptor — refresh-lock pattern
// ---------------------------------------------------------------------------

/** Module-scoped per-tab refresh lock. */
let refreshPromise: Promise<string> | null = null;

export const forceLogout = (): void => {
  setAccessToken(null);
  localStorage.removeItem("auth");
  localStorage.removeItem("lemonbet-auth"); // interim: clear legacy key too
  window.location.assign("/login");
};

type RefreshResult = { token: string; refreshToken: string; expiresIn: number };

export interface Handle401Deps {
  readAuth: () => AuthStorageValue | null;
  writeAuth: (v: AuthStorageValue) => void;
  forceLogout: () => void;
  postRefresh: (refreshToken: string) => Promise<RefreshResult>;
  axiosInstance: AxiosInstance;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

export const handle401 = async (
  error: AxiosError,
  deps: Handle401Deps,
): Promise<AxiosResponse> => {
  if (error.response?.status !== 401) throw error;

  const original = error.config as RetriableConfig | undefined;
  if (!original) throw error;

  // Loop guard: skip if this IS the refresh call or if we already retried
  if (original.url?.includes("/auth/refresh") || original._retried) {
    deps.forceLogout();
    throw error;
  }

  original._retried = true;

  const stored = deps.readAuth();
  if (!stored?.refreshToken) {
    deps.forceLogout();
    throw error;
  }

  const { refreshToken } = stored;

  refreshPromise ??= deps
    .postRefresh(refreshToken)
    .then((data) => {
      deps.writeAuth({ ...stored, token: data.token, refreshToken: data.refreshToken });
      setAccessToken(data.token);
      return data.token;
    })
    .catch((e: unknown) => {
      deps.forceLogout();
      throw e;
    })
    .finally(() => {
      refreshPromise = null;
    });

  const newToken = await refreshPromise;

  (original.headers as Record<string, unknown>).Authorization = `Bearer ${newToken}`;

  return deps.axiosInstance(original) as Promise<AxiosResponse>;
};

const defaultDeps: Handle401Deps = {
  readAuth,
  writeAuth,
  forceLogout,
  postRefresh: (rt) =>
    http
      .post<RefreshResult>(endpoints.auth.refresh, { refreshToken: rt })
      .then((r) => r.data),
  axiosInstance: http,
};

http.interceptors.response.use(
  (r) => r,
  (e: AxiosError) => handle401(e, defaultDeps),
);
