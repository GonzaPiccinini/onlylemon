import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CircleUserRoundIcon,
  BarChart3Icon,
  CircleDollarSignIcon,
  Clock3Icon,
  ListChecksIcon,
  LogOutIcon,
  MenuIcon,
  TagsIcon,
  UsersIcon,
  ShieldCheckIcon,
  ArrowRightLeftIcon,
  SettingsIcon,
  MessageCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/branding";
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
  { to: "/admin/conversions", label: "Conversiones", icon: ArrowRightLeftIcon },
  { to: "/admin/landings", label: "Landings", icon: TagsIcon },
  { to: "/admin/chat", label: "WhatsApp", icon: MessageCircleIcon },
  { to: "/admin/account", label: "Mi cuenta", icon: CircleUserRoundIcon },
  { to: "/admin/settings", label: "Configuracion", icon: SettingsIcon },
];

// Extra links visible only to SUPER_ADMIN
const superAdminLinks: ShellLink[] = [
  { to: "/admin/admins", label: "Admins", icon: ShieldCheckIcon },
];

const cashierLinks: ShellLink[] = [
  { to: "/cashier", label: "Sesion", icon: Clock3Icon },
  { to: "/cashier/chat", label: "WhatsApp", icon: MessageCircleIcon },
  { to: "/cashier/add-funds", label: "Cargas", icon: CircleDollarSignIcon },
  { to: "/cashier/conversions", label: "Conversiones", icon: ArrowRightLeftIcon },
  { to: "/cashier/account", label: "Mi cuenta", icon: CircleUserRoundIcon },
];

export const AppShell = () => {
  const { user, token, logout } = useAuth();
  const { data: runtimeState } = useCashierRuntimeState(user?.role === "CASHIER");
  useCashierRuntimeStateStream(token, user?.role === "CASHIER");
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  const isAdminRole = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  const links = isAdminRole
    ? [
        ...adminLinks,
        ...(user.role === "SUPER_ADMIN" ? superAdminLinks : []),
      ]
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
          <Link to={isAdminRole ? "/admin" : "/cashier"} className="block">
            <BrandLogo className="h-8 w-auto object-contain" />
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
            <Badge variant="secondary">
              {user.role === "SUPER_ADMIN" ? "Super Admin" : user.role === "ADMIN" ? "Admin" : "Cajero"}
            </Badge>
          </div>
          <Button variant="outline" onClick={logout}>
            <LogOutIcon data-icon="inline-start" />
            Cerrar sesion
          </Button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-4 md:pb-10">
        <header className="flex items-center justify-between rounded-2xl border bg-card/95 px-3 py-3 shadow-sm md:hidden">
          <div className="flex items-center gap-2">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger
                render={
                  <Button variant="outline" size="icon-sm" aria-label="Abrir menu">
                    <MenuIcon />
                  </Button>
                }
              />
              <SheetContent>
                <SheetTitle className="sr-only">Navegacion</SheetTitle>
                <Link
                  to={isAdminRole ? "/admin" : "/cashier"}
                  className="block"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <BrandLogo className="h-8 w-auto object-contain" />
                </Link>

                <nav className="flex flex-col gap-2">
                  {links.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      end={link.to === "/admin" || link.to === "/cashier"}
                      onClick={() => setIsMobileMenuOpen(false)}
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

                <div className="mt-auto flex flex-col gap-3">
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
                    <Badge variant="secondary">
                      {user.role === "SUPER_ADMIN" ? "Super Admin" : user.role === "ADMIN" ? "Admin" : "Cajero"}
                    </Badge>
                  </div>
                  <Button variant="outline" onClick={logout}>
                    <LogOutIcon data-icon="inline-start" />
                    Cerrar sesion
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <BrandLogo variant="mark" className="size-8 object-contain" />
            <Badge variant="secondary">
              {user.role === "SUPER_ADMIN" ? "Super Admin" : user.role === "ADMIN" ? "Admin" : "Cajero"}
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOutIcon data-icon="inline-start" />
            Salir
          </Button>
        </header>
        <Outlet />
      </main>
    </div>
  );
};
