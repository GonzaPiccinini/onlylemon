import axios from "axios";
import { endpoints } from "@/api/endpoints";
import { http } from "@/api/http";
import { env } from "@/config/env";
import type { AuthSession, SetupInput, SetupStatusResponse, User } from "@/types/domain";

export interface LoginInput {
  username: string;
  password: string;
}

// Public HTTP client — no Authorization header interceptor attached
const publicHttp = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 12_000,
});

export const authService = {
  async login(input: LoginInput): Promise<AuthSession> {
    const { data } = await http.post<AuthSession>(endpoints.auth.login, input);
    return data;
  },

  async me(): Promise<User> {
    const { data } = await http.get<User>(endpoints.auth.me);
    return data;
  },

  async logout(): Promise<void> {
    await http.post(endpoints.auth.logout);
  },

  async getSetupStatus(): Promise<SetupStatusResponse> {
    const { data } = await publicHttp.get<SetupStatusResponse>(endpoints.auth.setupStatus);
    return data;
  },

  async runSetup(input: SetupInput): Promise<AuthSession> {
    const { data } = await publicHttp.post<AuthSession>(endpoints.auth.setup, input);
    return data;
  },
};
