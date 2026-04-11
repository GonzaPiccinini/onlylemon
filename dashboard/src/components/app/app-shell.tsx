import type { ComponentType } from "react";
import { useEffect } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CircleUserRoundIcon,
  BarChart3Icon,
  CircleDollarSignIcon,
  Clock3Icon,
  ListChecksIcon,
  LogOutIcon,
  TagsIcon,
  UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-context";
import {
  useCashierRuntimeState,
  useCashierRuntimeStateStream,
} from "@/features/cashier/cashier-hooks";

interface ShellLink {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string; "data-icon"?: string }>;
}

const adminLinks: ShellLink[] = [
  { to: "/admin", label: "Cajeros", icon: UsersIcon },
  { to: "/admin/stats", label: "Estadisticas", icon: BarChart3Icon },
  { to: "/admin/leads", label: "Leads", icon: ListChecksIcon },
  { to: "/admin/landings", label: "Landings", icon: TagsIcon },
];

const cashierLinks: ShellLink[] = [
  { to: "/cashier", label: "Sesion", icon: Clock3Icon },
  { to: "/cashier/add-funds", label: "Cargas", icon: CircleDollarSignIcon },
  { to: "/cashier/history", label: "Leads", icon: BarChart3Icon },
  { to: "/cashier/account", label: "Mi cuenta", icon: CircleUserRoundIcon },
];

export const AppShell = () => {
  const { user, token, logout } = useAuth();
  const { data: runtimeState } = useCashierRuntimeState(user?.role === "CASHIER");
  useCashierRuntimeStateStream(token, user?.role === "CASHIER");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role !== "CASHIER") {
      return;
    }

    if (runtimeState?.cashierStatus === "DISABLED") {
      void logout();
      return;
    }

    if (!runtimeState || runtimeState.canOperateLeads) {
      return;
    }

    if (location.pathname !== "/cashier") {
      navigate("/cashier", { replace: true });
    }
  }, [location.pathname, navigate, logout, runtimeState, user?.role]);

  if (!user) {
    return null;
  }

  const links =
    user.role === "ADMIN"
      ? adminLinks
      : cashierLinks.filter((link) => {
          if (link.to !== "/cashier/add-funds") {
            return true;
          }

          return runtimeState?.canOperateLeads ?? true;
        });

  return (
    <div className="relative mx-auto flex min-h-svh w-full max-w-[1360px] gap-4 px-3 py-3 md:gap-6 md:px-6 md:py-6">
      <aside className="sticky top-4 hidden h-[calc(100svh-2rem)] w-[250px] flex-col justify-between rounded-2xl border bg-sidebar/90 p-5 shadow-sm backdrop-blur md:flex">
        <div className="flex flex-col gap-6">
          <Link to={user.role === "ADMIN" ? "/admin" : "/cashier"} className="block">
            <img
              src="/logo_con_nombre.png"
              alt="Lemonbet"
              className="h-8 w-auto object-contain"
              loading="eager"
            />
          </Link>

          <nav className="flex flex-col gap-2">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/admin" || link.to === "/cashier"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )
                }
              >
                <link.icon data-icon="inline-start" />
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3">
          <Separator />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
              {user.role === "CASHIER" ? (
                <p className="truncate text-xs text-muted-foreground">
                  WAHA: {runtimeState?.wahaStatus ?? "-"}
                </p>
              ) : null}
            </div>
            <Badge variant="secondary">{user.role === "ADMIN" ? "Admin" : "Cajero"}</Badge>
          </div>
          <Button variant="outline" onClick={logout}>
            <LogOutIcon data-icon="inline-start" />
            Cerrar sesion
          </Button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-4 pb-24 md:pb-10">
        <header className="flex items-center justify-between rounded-2xl border bg-card/95 px-3 py-3 shadow-sm md:hidden">
          <div className="flex items-center gap-2">
            <img src="/logo_sin_nombre.png" alt="Lemonbet" className="size-8 object-contain" loading="eager" />
            <Badge variant="secondary">{user.role === "ADMIN" ? "Admin" : "Cajero"}</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOutIcon data-icon="inline-start" />
            Salir
          </Button>
        </header>
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-sidebar/95 p-2 backdrop-blur md:hidden">
        <div
          className={cn(
            "mx-auto grid w-full max-w-[520px] gap-2",
            links.length === 2
              ? "grid-cols-2"
              : links.length === 4
                ? "grid-cols-4"
                : "grid-cols-3",
          )}
        >
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/admin" || link.to === "/cashier"}
              className={({ isActive }) =>
                cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )
              }
            >
              <link.icon />
              <span>{link.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};
