/**
 * chat.controller.ts
 *
 * HTTP handlers for the chat module.
 *
 * Responsibilities:
 * - Zod-validate request params / body / query.
 * - Extract requester identity (role + cashierId) from req.authUser.
 * - Delegate to ChatService.
 * - Map typed service errors to HTTP status codes:
 *     ChatForbiddenError       → 403
 *     ChatSessionNotFoundError → 404
 *     ChatRateLimitError       → 429
 *     null from getMediaBytes  → 404 { error: "MEDIA_UNAVAILABLE" }
 *
 * Photo-send route (POST .../media) is DEFERRED to Batch 6/7 (upload middleware).
 *
 * Design ref: whatsapp-chat-ui design §5 (controller).
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import type { ChatService } from './chat.service.js';
import {
  ChatForbiddenError,
  ChatRateLimitError,
  ChatSessionNotFoundError,
} from './chat.service.js';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().optional(),
});

const SendTextBodySchema = z.object({
  text: z.string().min(1).max(4096),
  replyTo: z.string().optional(),
});

/** reaction may be empty string (remove reaction). */
const SendReactionBodySchema = z.object({
  reaction: z.string(),
});

// ── Error → HTTP status mapping ───────────────────────────────────────────────

function mapServiceError(error: unknown, res: Response): boolean {
  if (error instanceof ChatForbiddenError) {
    res.status(403).json({ error: 'Forbidden' });
    return true;
  }
  if (error instanceof ChatSessionNotFoundError) {
    res.status(404).json({ error: 'Session not found' });
    return true;
  }
  if (error instanceof ChatRateLimitError) {
    res.status(429).json({ error: 'Rate limit exceeded' });
    return true;
  }
  return false;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export type ChatController = {
  listChats(req: Request, res: Response): Promise<void>;
  getChatHistory(req: Request, res: Response): Promise<void>;
  sendText(req: Request, res: Response): Promise<void>;
  sendReaction(req: Request, res: Response): Promise<void>;
  getMedia(req: Request, res: Response): Promise<void>;
};

export function createChatController(service: ChatService): ChatController {
  return {
    // ── GET /chat/sessions/:sessionId/chats ─────────────────────────────────
    async listChats(req: Request, res: Response): Promise<void> {
      const { sessionId } = req.params;
      const requesterRole = req.authUser!.role;
      const requesterCashierId = req.authUser!.cashierId;

      try {
        const chats = await service.listChats({
          sessionId,
          requesterRole,
          requesterCashierId,
        });
        res.status(200).json(chats);
      } catch (err) {
        if (!mapServiceError(err, res)) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    },

    // ── GET /chat/sessions/:sessionId/chats/:chatId/messages ────────────────
    async getChatHistory(req: Request, res: Response): Promise<void> {
      const { sessionId, chatId } = req.params;
      const requesterRole = req.authUser!.role;
      const requesterCashierId = req.authUser!.cashierId;

      const parsed = HistoryQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
        return;
      }

      const { limit, before } = parsed.data;

      try {
        const messages = await service.getChatHistory({
          sessionId,
          chatId,
          limit,
          before,
          requesterRole,
          requesterCashierId,
        });
        res.status(200).json(messages);
      } catch (err) {
        if (!mapServiceError(err, res)) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    },

    // ── POST /chat/sessions/:sessionId/chats/:chatId/messages ────────────────
    async sendText(req: Request, res: Response): Promise<void> {
      const { sessionId, chatId } = req.params;
      const requesterRole = req.authUser!.role;
      const requesterCashierId = req.authUser!.cashierId;

      const parsed = SendTextBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
        return;
      }

      const { text, replyTo } = parsed.data;

      try {
        await service.sendText({
          sessionId,
          chatId,
          text,
          replyTo,
          requesterRole,
          requesterCashierId,
        });
        res.status(200).json({ ok: true });
      } catch (err) {
        if (!mapServiceError(err, res)) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    },

    // ── POST /chat/sessions/:sessionId/chats/:chatId/messages/:messageId/reactions
    async sendReaction(req: Request, res: Response): Promise<void> {
      const { sessionId, chatId, messageId } = req.params;
      const requesterRole = req.authUser!.role;
      const requesterCashierId = req.authUser!.cashierId;

      const parsed = SendReactionBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
        return;
      }

      const { reaction } = parsed.data;

      try {
        await service.sendReaction({
          sessionId,
          chatId,
          messageId,
          reaction,
          requesterRole,
          requesterCashierId,
        });
        res.status(200).json({ ok: true });
      } catch (err) {
        if (!mapServiceError(err, res)) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    },

    // ── GET /chat/sessions/:sessionId/chats/:chatId/messages/:messageId/media
    async getMedia(req: Request, res: Response): Promise<void> {
      const { sessionId, chatId, messageId } = req.params;
      const requesterRole = req.authUser!.role;
      const requesterCashierId = req.authUser!.cashierId;

      try {
        const result = await service.getMediaBytes({
          sessionId,
          chatId,
          messageId,
          requesterRole,
          requesterCashierId,
        });

        if (!result) {
          res.status(404).json({ error: 'MEDIA_UNAVAILABLE' });
          return;
        }

        res.set('Content-Type', result.mimetype);
        res.status(200).send(result.bytes);
      } catch (err) {
        if (!mapServiceError(err, res)) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    },
  };
}
