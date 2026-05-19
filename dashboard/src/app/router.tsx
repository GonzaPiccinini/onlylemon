import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/app/app-shell";
import { AuthRedirect } from "@/components/app/auth-redirect";
import { NotFound } from "@/components/app/not-found";
import { RoleGuard } from "@/components/app/role-guard";
import { LoginPage } from "@/features/auth/login-page";
import { AdminAccountPage } from "@/features/admin/admin-account-page";
import { AdminCashiersPage } from "@/features/admin/admin-cashiers-page";
import { AdminStatsPage } from "@/features/admin/admin-stats-page";
import { AdminLandingsPage } from "@/features/admin/admin-landings-page";
import { AdminLeadsPage } from "@/features/admin/admin-leads-page";
import { AdminConversionsPage } from "@/features/admin/admin-conversions-page";
import { AdminManagementPage } from "@/features/admin-management/admin-management-page";
import { AdminSettingsPage } from "@/features/admin/settings/admin-settings-page";
import { CashierSessionPage } from "@/features/cashier/cashier-session-page";
import { CashierAddFundsPage } from "@/features/cashier/cashier-add-funds-page";
import { CashierAccountPage } from "@/features/cashier/cashier-account-page";
import { CashierConversionsPage } from "@/features/cashier/cashier-conversions-page";

// RoleGuard diff (task 23):
// Before: RoleGuard roles={["ADMIN"]} on all /admin/* routes
// After:  RoleGuard roles={["ADMIN", "SUPER_ADMIN"]} on shared /admin/* routes
//         RoleGuard roles={["SUPER_ADMIN"]} on /admin/admins (SUPER_ADMIN only)

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
    element: <RoleGuard roles={["ADMIN", "CASHIER", "SUPER_ADMIN"]} />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            element: <RoleGuard roles={["ADMIN", "SUPER_ADMIN"]} />,
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
              {
                path: "/admin/leads",
                element: <AdminLeadsPage />,
              },
              {
                path: "/admin/conversions",
                element: <AdminConversionsPage />,
              },
              {
                path: "/admin/account",
                element: <AdminAccountPage />,
              },
              {
                path: "/admin/settings",
                element: <AdminSettingsPage />,
              },
            ],
          },
          {
            element: <RoleGuard roles={["SUPER_ADMIN"]} />,
            children: [
              {
                path: "/admin/admins",
                element: <AdminManagementPage />,
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
                path: "/cashier/conversions",
                element: <CashierConversionsPage />,
              },
              {
                path: "/cashier/account",
                element: <CashierAccountPage />,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <NotFound />,
  },
]);
