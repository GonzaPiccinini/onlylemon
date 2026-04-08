import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/features/auth/auth-context";
import type { Role } from "@/types/domain";

interface RoleGuardProps {
  roles: Role[];
}

export const RoleGuard = ({ roles }: RoleGuardProps) => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!user || !roles.includes(user.role)) {
    const fallback = user?.role === "CASHIER" ? "/cashier" : "/admin";
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
};
