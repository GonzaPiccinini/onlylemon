import axios, { type AxiosError } from "axios";
import { env } from "@/config/env";

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
