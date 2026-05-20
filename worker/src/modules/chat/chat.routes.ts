/**
 * chat.routes.ts
 *
 * Two route groups for the chat module:
 *
 * 1. Cashier-scoped (/chat/sessions/:sessionId/...):
 *    requireAuth → requireRole('CASHIER') → requireSessionOwnership → controller
 *
 * 2. Admin-scoped (/admin/chat/cashiers/:cashierId/sessions/:sessionId/...):
 *    requireAuth → requireRole('ADMIN','SUPER_ADMIN') → controller (flat scope, no ownership)
 *
 * NOTE: Photo-send route (POST .../media) is DEFERRED to Batch 6/7
 * (multipart upload middleware not yet available).
 * The media-GET proxy route (GET .../media) IS included here.
 *
 * Design ref: whatsapp-chat-ui design §5 (routes).
 * Spec amendments: sendReaction is worker→WAHA via PUT in service/repo (transparent here);
 *   dashboard→worker remains POST (these routes).
 *   Photo+quote deferred to V2 — POST .../media route is NOT advertised.
 *
 * Note on auth middleware injection: requireAuth and requireRole are injected
 * (not statically imported here) so that test files can instantiate this router
 * without loading the DB-backed auth module at import time.
 */

import { Router } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createRequireSessionOwnership } from '../../middlewares/require-session-ownership.middleware.js';
import type { RequireSessionOwnershipDeps } from '../../middlewares/require-session-ownership.middleware.js';
import { createChatController } from './chat.controller.js';
import type { ChatService } from './chat.service.js';
import type { Role } from '../../types/api.js';

// ── Factory options ───────────────────────────────────────────────────────────

export type ChatRouterOptions = {
  /** The chat service implementation (real or mock). */
  service: ChatService;

  /** Session lookup for the requireSessionOwnership middleware. */
  getWhatsappSession: RequireSessionOwnershipDeps['getWhatsappSession'];

  /**
   * Auth middleware that verifies JWT and sets req.authUser.
   * In production: pass the real `requireAuth` from auth.middleware.ts.
   * In tests: pass a lightweight JWT-verify stub (no DB calls).
   */
  requireAuth: RequestHandler;

  /**
   * Role guard factory. Returns a middleware that enforces role membership.
   * In production: pass the real `requireRole` from auth.middleware.ts.
   * In tests: pass a lightweight role-check stub (only reads req.authUser.role, no DB).
   */
  requireRole: (...roles: Role[]) => RequestHandler;
};

// ── Factory ───────────────────────────────────────────────────────────────────

export function createChatRouter(opts: ChatRouterOptions): Router {
  const {
    service,
    getWhatsappSession,
    requireAuth,
    requireRole,
  } = opts;

  const controller = createChatController(service);

  const ownershipMiddleware = createRequireSessionOwnership({ getWhatsappSession });

  const cashierRoleGuard = requireRole('CASHIER');
  const adminRoleGuard = requireRole('ADMIN', 'SUPER_ADMIN');

  const router = Router();

  // ── Cashier-scoped group ──────────────────────────────────────────────────
  // All routes: auth → CASHIER role → session ownership → handler

  const cashierMiddleware: RequestHandler[] = [
    requireAuth,
    cashierRoleGuard as RequestHandler,
    ownershipMiddleware as unknown as RequestHandler,
  ];

  router.get(
    '/chat/sessions/:sessionId/chats',
    ...cashierMiddleware,
    wrapAsync(controller.listChats.bind(controller)),
  );

  router.get(
    '/chat/sessions/:sessionId/chats/:chatId/messages',
    ...cashierMiddleware,
    wrapAsync(controller.getChatHistory.bind(controller)),
  );

  router.post(
    '/chat/sessions/:sessionId/chats/:chatId/messages',
    ...cashierMiddleware,
    wrapAsync(controller.sendText.bind(controller)),
  );

  router.post(
    '/chat/sessions/:sessionId/chats/:chatId/messages/:messageId/reactions',
    ...cashierMiddleware,
    wrapAsync(controller.sendReaction.bind(controller)),
  );

  router.get(
    '/chat/sessions/:sessionId/chats/:chatId/messages/:messageId/media',
    ...cashierMiddleware,
    wrapAsync(controller.getMedia.bind(controller)),
  );

  // POST /chat/sessions/:sessionId/chats/:chatId/media (photo-send) is DEFERRED to Batch 6/7.
  // It requires multipart upload middleware (multer) which is not yet installed.

  // ── Admin-scoped group ────────────────────────────────────────────────────
  // All routes: auth → ADMIN|SUPER_ADMIN role → handler (flat scope, no ownership)
  // The session must exist → 404 handling occurs in the controller/service.

  const adminMiddleware: RequestHandler[] = [
    requireAuth,
    adminRoleGuard as RequestHandler,
  ];

  router.get(
    '/admin/chat/cashiers/:cashierId/sessions/:sessionId/chats',
    ...adminMiddleware,
    wrapAsync(controller.listChats.bind(controller)),
  );

  router.get(
    '/admin/chat/cashiers/:cashierId/sessions/:sessionId/chats/:chatId/messages',
    ...adminMiddleware,
    wrapAsync(controller.getChatHistory.bind(controller)),
  );

  router.post(
    '/admin/chat/cashiers/:cashierId/sessions/:sessionId/chats/:chatId/messages',
    ...adminMiddleware,
    wrapAsync(controller.sendText.bind(controller)),
  );

  router.post(
    '/admin/chat/cashiers/:cashierId/sessions/:sessionId/chats/:chatId/messages/:messageId/reactions',
    ...adminMiddleware,
    wrapAsync(controller.sendReaction.bind(controller)),
  );

  router.get(
    '/admin/chat/cashiers/:cashierId/sessions/:sessionId/chats/:chatId/messages/:messageId/media',
    ...adminMiddleware,
    wrapAsync(controller.getMedia.bind(controller)),
  );

  // POST /admin/chat/.../media (photo-send) is DEFERRED to Batch 6/7.

  return router;
}

// ── Utility ───────────────────────────────────────────────────────────────────

/** Wraps an async handler so unhandled rejections propagate to Express error handler. */
function wrapAsync(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
