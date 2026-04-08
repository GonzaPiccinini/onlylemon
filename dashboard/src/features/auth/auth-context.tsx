import {
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

const AUTH_STORAGE_KEY = "lemonbet-auth";

interface AuthStorageValue {
  token: string;
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
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const readStorage = (): AuthStorageValue | null => {
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
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    },
  });

  const logout = async () => {
    try {
      await authService.logout();
    } catch {
      // ignore logout errors to force local session cleanup
    }

    setToken(null);
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  };

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
    }),
    [loginMutation, token, user],
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
