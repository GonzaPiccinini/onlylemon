export const endpoints = {
  auth: {
    login: "/auth/login",
    me: "/auth/me",
    logout: "/auth/logout",
  },
  admin: {
    cashiers: "/admin/cashiers",
    cashierById: (cashierId: string) => `/admin/cashiers/${cashierId}`,
    cashierDisable: (cashierId: string) => `/admin/cashiers/${cashierId}/disable`,
    statsSummary: "/admin/stats/summary",
    statsByCashier: "/admin/stats/cashiers",
    statsFundsSeries: "/admin/stats/funds-series",
  },
  cashier: {
    sessions: "/cashier/sessions",
    currentSession: "/cashier/sessions/current",
    sessionStart: "/cashier/sessions/start",
    sessionFinish: "/cashier/sessions/finish",
    clientPhones: "/cashier/client-phones",
    addFunds: "/cashier/add-funds",
    addFundsHistory: "/cashier/add-funds/history",
  },
};
