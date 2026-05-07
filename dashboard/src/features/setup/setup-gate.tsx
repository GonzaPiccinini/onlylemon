/**
 * SetupGate — one-shot first-run detection.
 *
 * On mount, calls GET /auth/setup-status exactly once (no TanStack Query, no staleTime).
 * Decision logic:
 *   - needsSetup === true AND no authenticated session → render <SetupPage /> (outside RouterProvider)
 *   - needsSetup === false OR authenticated → render children (RouterProvider)
 *   - error → fail-open: render children and log. We never block app boot on a probe failure.
 *
 * Trade-off: fail-open means a network error (e.g. backend down) will show the login page
 * instead of the setup page. Acceptable because: (a) if the backend is down, neither page
 * works; (b) false-negative (showing login when setup needed) is recoverable — user can try
 * again once the backend is up. False-positive (showing setup when already initialized) is
 * blocked by the server returning 409, so data integrity is preserved.
 *
 * Design constraint: <SetupPage> renders OUTSIDE <RouterProvider>, so useNavigate is
 * unavailable inside SetupPage. Navigation after setup uses window.location.assign (hard reload).
 */
import { useEffect, useState, type ReactNode } from "react";
import { authService } from "@/api/auth.service";
import { SetupPage } from "@/features/setup/setup-page";

const AUTH_STORAGE_KEY = "lemonbet-auth";

const hasAuthSession = (): boolean => {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Boolean(
      parsed &&
      typeof parsed === "object" &&
      "token" in parsed &&
      "user" in parsed
    );
  } catch {
    return false;
  }
};

type GateState = "loading" | "setup" | "ready";

interface SetupGateProps {
  children: ReactNode;
}

export const SetupGate = ({ children }: SetupGateProps) => {
  const [state, setState] = useState<GateState>("loading");

  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      // If already authenticated, skip probe and go straight to app
      if (hasAuthSession()) {
        if (!cancelled) setState("ready");
        return;
      }

      try {
        const { needsSetup } = await authService.getSetupStatus();
        if (!cancelled) {
          setState(needsSetup ? "setup" : "ready");
        }
      } catch (err) {
        // Fail-open: log and proceed to app (login page handles auth)
        console.warn("[SetupGate] setup-status probe failed — falling back to login flow", err);
        if (!cancelled) setState("ready");
      }
    };

    void probe();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <span className="text-sm text-muted-foreground">Cargando...</span>
      </div>
    );
  }

  if (state === "setup") {
    return <SetupPage />;
  }

  return <>{children}</>;
};
