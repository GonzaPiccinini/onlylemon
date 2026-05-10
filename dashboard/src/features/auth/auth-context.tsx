/* eslint-disable react-refresh/only-export-components */
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation } from "@tanstack/react-query";
import { authService, type LoginInput } from "@/api/auth.service";
import { setAccessToken, toApiError } from "@/api/http";
import type { Role, User } from "@/types/domain";

const AUTH_STORAGE_KEY = "auth";

interface AuthStorageValue {
  token: string;
  refreshToken: string | null;
  user: User;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  hasRole: (role: Role) => boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  isLoggingIn: boolean;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const readStorage = (): AuthStorageValue | null => {
  // One-shot migration from legacy key
  const legacyRaw = localStorage.getItem("lemonbet-auth");
  if (!localStorage.getItem("auth") && legacyRaw) {
    try {
      const legacy = JSON.parse(legacyRaw) as { token: string; user: User };
      localStorage.setItem(
        "auth",
        JSON.stringify({ token: legacy.token, refreshToken: null, user: legacy.user }),
      );
    } catch {
      console.warn("[auth-migration] legacy parse failed; clearing both keys");
      localStorage.removeItem("auth");
    }
    localStorage.removeItem("lemonbet-auth");
  }

  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthStorageValue;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const initial = readStorage();
  const [token, setToken] = useState<string | null>(initial?.token ?? null);
  const [user, setUser] = useState<User | null>(initial?.user ?? null);

  useEffect(() => {
    setAccessToken(token);
  }, [token]);

  const loginMutation = useMutation({
    mutationFn: authService.login,
    onSuccess: (session) => {
      setToken(session.token);
      setUser(session.user);
      setAccessToken(session.token);
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ token: session.token, refreshToken: session.refreshToken, user: session.user }),
      );
    },
  });

  const logout = useCallback(async () => {
    const stored = readStorage();
    try {
      if (stored?.refreshToken) {
        await authService.logout({ refreshToken: stored.refreshToken });
      }
    } catch {
      // ignore logout errors to force local session cleanup
    }

    setToken(null);
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!token) {
      return;
    }

    try {
      const me = await authService.me();
      const stored = readStorage();
      setUser(me);
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ token, refreshToken: stored?.refreshToken ?? null, user: me }),
      );
    } catch {
      await logout();
    }
  }, [logout, token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user && token),
      hasRole: (role) => user?.role === role,
      login: async (input) => {
        try {
          await loginMutation.mutateAsync(input);
        } catch (error) {
          throw toApiError(error);
        }
      },
      logout,
      isLoggingIn: loginMutation.isPending,
      refreshMe,
    }),
    [loginMutation, logout, refreshMe, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
};
