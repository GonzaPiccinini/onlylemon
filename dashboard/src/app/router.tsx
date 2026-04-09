import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/app/app-shell";
import { AuthRedirect } from "@/components/app/auth-redirect";
import { RoleGuard } from "@/components/app/role-guard";
import { LoginPage } from "@/features/auth/login-page";
import { AdminCashiersPage } from "@/features/admin/admin-cashiers-page";
import { AdminStatsPage } from "@/features/admin/admin-stats-page";
import { AdminLandingsPage } from "@/features/admin/admin-landings-page";
import { CashierSessionPage } from "@/features/cashier/cashier-session-page";
import { CashierAddFundsPage } from "@/features/cashier/cashier-add-funds-page";
import { CashierHistoryPage } from "@/features/cashier/cashier-history-page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AuthRedirect />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    element: <RoleGuard roles={["ADMIN", "CASHIER"]} />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            element: <RoleGuard roles={["ADMIN"]} />,
            children: [
              {
                path: "/admin",
                element: <AdminCashiersPage />,
              },
              {
                path: "/admin/stats",
                element: <AdminStatsPage />,
              },
              {
                path: "/admin/landings",
                element: <AdminLandingsPage />,
              },
            ],
          },
          {
            element: <RoleGuard roles={["CASHIER"]} />,
            children: [
              {
                path: "/cashier",
                element: <CashierSessionPage />,
              },
              {
                path: "/cashier/add-funds",
                element: <CashierAddFundsPage />,
              },
              {
                path: "/cashier/history",
                element: <CashierHistoryPage />,
              },
            ],
          },
        ],
      },
    ],
  },
]);
