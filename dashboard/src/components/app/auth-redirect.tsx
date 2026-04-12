import { Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth/auth-context";
import { useCashierRuntimeState } from "@/features/cashier/cashier-hooks";

export const AuthRedirect = () => {
  const { isAuthenticated, user } = useAuth();
  const runtimeState = useCashierRuntimeState(user?.role === "CASHIER");

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === "CASHIER") {
    if (runtimeState.isLoading) {
      return null;
    }

    const target = runtimeState.data?.canOperateLeads ? "/cashier/add-funds" : "/cashier";
    return <Navigate to={target} replace />;
  }

  const target = "/admin";
  return <Navigate to={target} replace />;
};
