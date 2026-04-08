import { endpoints } from "@/api/endpoints";
import { http } from "@/api/http";
import type { AuthSession, User } from "@/types/domain";

export interface LoginInput {
  username: string;
  password: string;
}

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
};
