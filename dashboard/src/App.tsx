import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/features/auth/auth-context";
import { SetupGate } from "@/features/setup/setup-gate";
import { queryClient } from "@/lib/query-client";
import { router } from "@/app/router";

// SetupGate placement decision:
// AuthProvider is OUTSIDE SetupGate so that SetupGate can do a direct localStorage check
// (hasAuthSession) without depending on useAuth. This avoids the need to add a public
// setSession setter to auth-context (locked decision 7). The tradeoff is that SetupGate
// has its own private localStorage read, which duplicates the auth-context read once at boot.
// After the hard-reload in SetupPage, AuthProvider reads the same localStorage key and
// initialises the session normally.

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SetupGate>
          <RouterProvider router={router} />
        </SetupGate>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
