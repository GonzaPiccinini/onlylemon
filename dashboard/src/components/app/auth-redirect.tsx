import { Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth/auth-context";

export const AuthRedirect = () => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const target = user.role === "ADMIN" ? "/admin" : "/cashier";
  return <Navigate to={target} replace />;
};
