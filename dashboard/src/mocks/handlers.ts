import { addDays, format } from "date-fns";
import { delay, http, HttpResponse } from "msw";
import { env } from "@/config/env";
import {
  addFundsForCashier,
  createCashier,
  disableCashier,
  finishSessionForCashier,
  getCashierStats,
  getCredentialsById,
  getCredentialsByUsername,
  getCurrentSessionForCashier,
  getFundsSeries,
  getSummary,
  listAddFundsForCashier,
  listCashiers,
  listClientPhones,
  listSessionsForCashier,
  startSessionForCashier,
  toSafeUser,
  updateCashier,
} from "@/mocks/data";
import type { DateRangeFilters } from "@/types/domain";

const API_PREFIX = "*/api";
const TOKEN_PREFIX = "mock-token:";

const unauthorized = () =>
  HttpResponse.json({ error: "Unauthorized" }, { status: 401 });

const forbidden = () => HttpResponse.json({ error: "Forbidden" }, { status: 403 });

const notFound = (message = "Not found") =>
  HttpResponse.json({ error: message }, { status: 404 });

const badRequest = (message: string) =>
  HttpResponse.json({ error: message }, { status: 400 });

const getTokenUser = (request: Request) => {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token.startsWith(TOKEN_PREFIX)) {
    return null;
  }

  const userId = token.replace(TOKEN_PREFIX, "");
  return getCredentialsById(userId) ?? null;
};

const requireRole = (request: Request, role: "ADMIN" | "CASHIER") => {
  const user = getTokenUser(request);

  if (!user) {
    return { error: unauthorized() };
  }

  if (user.role !== role) {
    return { error: forbidden() };
  }

  return { user };
};

const parseDateRange = (request: Request): DateRangeFilters => {
  const { searchParams } = new URL(request.url);
  const to = searchParams.get("to") ?? format(new Date(), "yyyy-MM-dd");
  const from =
    searchParams.get("from") ?? format(addDays(new Date(), -7), "yyyy-MM-dd");
  const cashierId = searchParams.get("cashierId") ?? undefined;

  return { from, to, cashierId };
};

export const handlers = [
  http.post(`${API_PREFIX}/auth/login`, async ({ request }) => {
    await delay(env.mockDelayMs);
    const body = (await request.json()) as { username?: string; password?: string };

    if (!body.username || !body.password) {
      return badRequest("username and password are required");
    }

    const user = getCredentialsByUsername(body.username);
    if (!user || user.password !== body.password) {
      return HttpResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    return HttpResponse.json({
      token: `${TOKEN_PREFIX}${user.id}`,
      user: toSafeUser(user),
    });
  }),

  http.get(`${API_PREFIX}/auth/me`, async ({ request }) => {
    await delay(env.mockDelayMs);
    const user = getTokenUser(request);
    if (!user) {
      return unauthorized();
    }

    return HttpResponse.json(toSafeUser(user));
  }),

  http.post(`${API_PREFIX}/auth/logout`, async () => {
    await delay(env.mockDelayMs);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API_PREFIX}/admin/cashiers`, async ({ request }) => {
    await delay(env.mockDelayMs);
    const auth = requireRole(request, "ADMIN");
    if (auth.error) {
      return auth.error;
    }

    return HttpResponse.json(listCashiers());
  }),

  http.post(`${API_PREFIX}/admin/cashiers`, async ({ request }) => {
    await delay(env.mockDelayMs);
    const auth = requireRole(request, "ADMIN");
    if (auth.error) {
      return auth.error;
    }

    const body = (await request.json()) as {
      name?: string;
      username?: string;
      password?: string;
    };

    if (!body.name || !body.username || !body.password) {
      return badRequest("name, username and password are required");
    }

    const cashier = createCashier({
      name: body.name,
      username: body.username,
      password: body.password,
    });

    return HttpResponse.json(cashier, { status: 201 });
  }),

  http.put(`${API_PREFIX}/admin/cashiers/:cashierId`, async ({ request, params }) => {
    await delay(env.mockDelayMs);
    const auth = requireRole(request, "ADMIN");
    if (auth.error) {
      return auth.error;
    }

    const body = (await request.json()) as { name?: string; username?: string };
    if (!body.name || !body.username) {
      return badRequest("name and username are required");
    }

    const updated = updateCashier(String(params.cashierId), {
      name: body.name,
      username: body.username,
    });

    if (!updated) {
      return notFound("Cashier not found");
    }

    return HttpResponse.json(updated);
  }),

  http.patch(
    `${API_PREFIX}/admin/cashiers/:cashierId/disable`,
    async ({ request, params }) => {
      await delay(env.mockDelayMs);
      const auth = requireRole(request, "ADMIN");
      if (auth.error) {
        return auth.error;
      }

      const success = disableCashier(String(params.cashierId));
      if (!success) {
        return notFound("Cashier not found");
      }

      return new HttpResponse(null, { status: 204 });
    },
  ),

  http.get(`${API_PREFIX}/admin/stats/summary`, async ({ request }) => {
    await delay(env.mockDelayMs);
    const auth = requireRole(request, "ADMIN");
    if (auth.error) {
      return auth.error;
    }

    return HttpResponse.json(getSummary(parseDateRange(request)));
  }),

  http.get(`${API_PREFIX}/admin/stats/cashiers`, async ({ request }) => {
    await delay(env.mockDelayMs);
    const auth = requireRole(request, "ADMIN");
    if (auth.error) {
      return auth.error;
    }

    return HttpResponse.json(getCashierStats(parseDateRange(request)));
  }),

  http.get(`${API_PREFIX}/admin/stats/funds-series`, async ({ request }) => {
    await delay(env.mockDelayMs);
    const auth = requireRole(request, "ADMIN");
    if (auth.error) {
      return auth.error;
    }

    return HttpResponse.json(getFundsSeries(parseDateRange(request)));
  }),

  http.get(`${API_PREFIX}/cashier/sessions`, async ({ request }) => {
    await delay(env.mockDelayMs);
    const auth = requireRole(request, "CASHIER");
    if (auth.error) {
      return auth.error;
    }

    if (!auth.user.cashierId) {
      return badRequest("Cashier profile not linked");
    }

    return HttpResponse.json(listSessionsForCashier(auth.user.cashierId));
  }),

  http.get(`${API_PREFIX}/cashier/sessions/current`, async ({ request }) => {
    await delay(env.mockDelayMs);
    const auth = requireRole(request, "CASHIER");
    if (auth.error) {
      return auth.error;
    }

    if (!auth.user.cashierId) {
      return badRequest("Cashier profile not linked");
    }

    return HttpResponse.json(getCurrentSessionForCashier(auth.user.cashierId));
  }),

  http.post(`${API_PREFIX}/cashier/sessions/start`, async ({ request }) => {
    await delay(env.mockDelayMs);
    const auth = requireRole(request, "CASHIER");
    if (auth.error) {
      return auth.error;
    }

    if (!auth.user.cashierId) {
      return badRequest("Cashier profile not linked");
    }

    const started = startSessionForCashier(auth.user.cashierId);
    if (!started) {
      return HttpResponse.json(
        { error: "No se pudo iniciar sesion. Puede haber una sesion activa." },
        { status: 409 },
      );
    }

    return HttpResponse.json(started, { status: 201 });
  }),

  http.post(`${API_PREFIX}/cashier/sessions/finish`, async ({ request }) => {
    await delay(env.mockDelayMs);
    const auth = requireRole(request, "CASHIER");
    if (auth.error) {
      return auth.error;
    }

    if (!auth.user.cashierId) {
      return badRequest("Cashier profile not linked");
    }

    const finished = finishSessionForCashier(auth.user.cashierId);
    if (!finished) {
      return HttpResponse.json(
        { error: "No hay una sesion activa para finalizar." },
        { status: 409 },
      );
    }

    return HttpResponse.json(finished);
  }),

  http.get(`${API_PREFIX}/cashier/client-phones`, async ({ request }) => {
    await delay(env.mockDelayMs);
    const auth = requireRole(request, "CASHIER");
    if (auth.error) {
      return auth.error;
    }

    return HttpResponse.json(listClientPhones());
  }),

  http.post(`${API_PREFIX}/cashier/add-funds`, async ({ request }) => {
    await delay(env.mockDelayMs);
    const auth = requireRole(request, "CASHIER");
    if (auth.error) {
      return auth.error;
    }

    if (!auth.user.cashierId) {
      return badRequest("Cashier profile not linked");
    }

    const body = (await request.json()) as {
      userName?: string;
      phoneId?: string;
      phoneNumber?: string;
      amount?: number;
    };
    if (!body.userName || !body.phoneId || !body.phoneNumber || !body.amount) {
      return badRequest("userName, phoneId, phoneNumber and amount are required");
    }

    const operation = addFundsForCashier(auth.user.cashierId, {
      userName: body.userName,
      phoneId: body.phoneId,
      phoneNumber: body.phoneNumber,
      amount: body.amount,
    });

    if (!operation) {
      return HttpResponse.json(
        { error: "No se pudo registrar la carga." },
        { status: 409 },
      );
    }

    return HttpResponse.json(operation, { status: 201 });
  }),

  http.get(`${API_PREFIX}/cashier/add-funds/history`, async ({ request }) => {
    await delay(env.mockDelayMs);
    const auth = requireRole(request, "CASHIER");
    if (auth.error) {
      return auth.error;
    }

    if (!auth.user.cashierId) {
      return badRequest("Cashier profile not linked");
    }

    return HttpResponse.json(listAddFundsForCashier(auth.user.cashierId));
  }),
];
