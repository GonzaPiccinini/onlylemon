import express from 'express';
import cors from 'cors';
import type { CorsOptions } from 'cors';

import { config } from '../config/env.js';
import { worker } from './worker.js';
import { leadsPost } from '../integrations/leads/http.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { adminRouter } from '../modules/admin/admin.routes.js';
import { cashierRouter } from '../modules/cashier/cashier.routes.js';
import { realtimeRouter } from '../modules/realtime/realtime.routes.js';
import { createChatRouter } from '../modules/chat/chat.routes.js';
import { requireAuth, requireRole } from '../modules/security/auth.middleware.js';
import { createDefaultChatService } from '../modules/chat/chat.service.js';
import { publicSettingsRouter } from '../modules/system-settings/public-routes.js';
import { captchaRouter } from '../modules/captcha/captcha.routes.js';
import { embedRouter } from '../modules/embed/embed.routes.js';
import { isCorsOriginAllowed } from '../modules/security/cors-origins.service.js';
import { requestLoggingMiddleware } from '../middlewares/request-logging.middleware.js';
import { errorMiddleware } from '../middlewares/error.middleware.js';
import { logger } from '../lib/logger.js';
import { memoizeAsync } from '../lib/memoize-async.js';
import { register } from '../lib/metrics.js';
import { prisma } from '../persistence/prisma/client.js';
import { getSessions, updateSessionConfig } from '../integrations/waha/client.js';
import { ensureSessionsSubscribedToReactions } from '../integrations/waha/ensure-session-events.js';

const app = express();
const port = config.PORT; // NO TOCAR PORQUE ROMPE EL CODIGO DE OPENAI

const corsOptions: CorsOptions = {
  origin: async (origin, callback) => {
    try {
      const allowed = await isCorsOriginAllowed(origin);
      callback(allowed ? null : new Error('Not allowed by CORS'), allowed);
    } catch {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(express.json());
app.use(cors(corsOptions));
app.use(requestLoggingMiddleware);

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ ok: true, db: 'connected' });
  } catch {
    res.status(503).json({ ok: false, db: 'error' });
  }
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.post('/receive', (_req, res) => {
  res.status(202).json({ received: true });
});

// ── Chat router (Batch 5) ──────────────────────────────────────────────────────
// Lazily initialized on first request so we can await the default service factory
// without blocking module load time (server.ts does not support top-level await).
// The init Promise is memoized (not the resolved router) so a burst of requests
// arriving before the first init resolves all share ONE ChatService/rate-limiter
// instead of each building its own.
const getChatRouter = memoizeAsync(async () => {
  const chatService = await createDefaultChatService();
  return createChatRouter({
    service: chatService,
    getWhatsappSession: async (sessionId) =>
      prisma.whatsappSession.findUnique({
        where: { id: sessionId },
        select: { id: true, sessionName: true, cashierId: true },
      }),
    requireAuth,
    requireRole,
  });
});

app.use('/api', (req, res, next) => {
  getChatRouter()
    .then((chatRouter) => chatRouter(req, res, next))
    .catch(next);
});

// ── Public routes (before CORS-gated routes) ──────────────────────────────────
// Altcha challenge endpoint — no CORS gating, public GET
app.use('/altcha', captchaRouter);

// Embed bundle endpoint — no CORS gating, public GET (classic script tag resource)
app.use('/embed', embedRouter);

// ── Other routers ─────────────────────────────────────────────────────────────
app.post('/api/leads', leadsPost);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/cashier', cashierRouter);
app.use('/api/realtime', realtimeRouter);
app.use('/api/settings', publicSettingsRouter);

app.use(errorMiddleware);

const server = app.listen(port, () => {
  logger.info({ port }, 'server listening');

  // ADR-8: Boot-time idempotent fixup — subscribe any pre-existing WAHA sessions
  // to 'message.reaction' if they were created before this event was added to the
  // default event set. Runs fire-and-forget so it never blocks or crashes boot.
  // If WAHA is unreachable (common in local dev without the waha docker profile),
  // the function logs a warn and returns zero counts — the worker remains healthy.
  void ensureSessionsSubscribedToReactions({
    getSessions,
    updateSessionConfig,
    logger,
  }).then((result) => {
    logger.info(
      result,
      'boot fixup: ensureSessionsSubscribedToReactions complete',
    );
  });
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutdown signal received');
  await worker.close();
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
