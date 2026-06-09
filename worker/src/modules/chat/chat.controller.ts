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
 * Photo-send handler (sendPhoto) runs AFTER the uploadSingleFile middleware has
 * parsed req.file into memory (no disk write). It performs magic-byte verification
 * before delegating to ChatService.sendPhoto.
 *
 * NOTE: replyTo is intentionally NOT accepted on the photo-send route (V2 deferral —
 * the WAHA sendImage wrapper has no reply_to support in V1).
 *
 * Design ref: whatsapp-chat-ui design §5 (controller), §7 (upload pipeline).
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import type { ChatService } from './chat.service.js';
import {
  ChatForbiddenError,
  ChatRateLimitError,
  ChatSessionNotFoundError,
} from './chat.service.js';
import { sniffImageMagicBytes } from './upload.middleware.js';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).optional(),
});

const SendTextBodySchema = z.object({
  text: z.string().min(1).max(4096),
  replyTo: z.string().optional(),
});

/** reaction may be empty string (remove reaction). */
const SendReactionBodySchema = z.object({
  reaction: z.string(),
});

/** WhatsApp caps status text around 700 chars. backgroundColor is a hex color. */
const PublishTextStatusBodySchema = z.object({
  text: z.string().min(1).max(700),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
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
  /**
   * sendPhoto — runs AFTER uploadSingleFile middleware.
   * Validates magic bytes, then delegates to service.sendPhoto.
   * Does NOT accept replyTo (V2 deferral — see spec-amendments).
   */
  sendPhoto(req: Request, res: Response): Promise<void>;
  sendReaction(req: Request, res: Response): Promise<void>;
  getMedia(req: Request, res: Response): Promise<void>;
  publishTextStatus(req: Request, res: Response): Promise<void>;
  /** publishImageStatus — runs AFTER uploadSingleFile middleware (like sendPhoto). */
  publishImageStatus(req: Request, res: Response): Promise<void>;
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

      const { limit, offset } = parsed.data;

      try {
        const messages = await service.getChatHistory({
          sessionId,
          chatId,
          limit,
          offset,
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

    // ── POST /chat/sessions/:sessionId/chats/:chatId/media ──────────────────────
    // Runs AFTER uploadSingleFile middleware has parsed req.file into memory.
    // Magic-byte verification is done here (controller has full file buffer).
    // NOTE: replyTo is intentionally NOT read from req.body (V2 deferral —
    // WAHA sendImage has no reply_to support; spec-amendments confirm this).
    async sendPhoto(req: Request, res: Response): Promise<void> {
      const { sessionId, chatId } = req.params;
      const requesterRole = req.authUser!.role;
      const requesterCashierId = req.authUser!.cashierId;

      // 400 — upload middleware didn't populate req.file (no file in request)
      if (!req.file) {
        res.status(400).json({ error: 'Missing file — upload a file field named "file"' });
        return;
      }

      // 415 — magic bytes do not match the declared MIME type
      if (!sniffImageMagicBytes(req.file.buffer, req.file.mimetype)) {
        res.status(415).json({ error: 'File content does not match declared MIME type' });
        return;
      }

      // Optional caption from multipart body. replyTo deliberately NOT read (V2).
      const caption = typeof req.body?.caption === 'string' ? req.body.caption : undefined;

      try {
        await service.sendPhoto({
          sessionId,
          chatId,
          file: {
            // Pass base64-encoded data — service.sendPhoto also converts Buffer→base64
            // but accepts both; passing base64 string directly is cleaner here.
            data: req.file.buffer.toString('base64'),
            mimetype: req.file.mimetype,
          },
          caption,
          // replyTo is intentionally omitted (V2 deferral)
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

    // ── POST /chat/sessions/:sessionId/status/text ───────────────────────────
    async publishTextStatus(req: Request, res: Response): Promise<void> {
      const { sessionId } = req.params;
      const requesterRole = req.authUser!.role;
      const requesterCashierId = req.authUser!.cashierId;

      const parsed = PublishTextStatusBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
        return;
      }

      const { text, backgroundColor } = parsed.data;

      try {
        await service.publishTextStatus({
          sessionId,
          text,
          backgroundColor,
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

    // ── POST /chat/sessions/:sessionId/status/image ──────────────────────────
    // Runs AFTER uploadSingleFile middleware — same pipeline as sendPhoto.
    async publishImageStatus(req: Request, res: Response): Promise<void> {
      const { sessionId } = req.params;
      const requesterRole = req.authUser!.role;
      const requesterCashierId = req.authUser!.cashierId;

      if (!req.file) {
        res.status(400).json({ error: 'Missing file — upload a file field named "file"' });
        return;
      }

      if (!sniffImageMagicBytes(req.file.buffer, req.file.mimetype)) {
        res.status(415).json({ error: 'File content does not match declared MIME type' });
        return;
      }

      const caption = typeof req.body?.caption === 'string' ? req.body.caption : undefined;

      try {
        await service.publishImageStatus({
          sessionId,
          file: {
            data: req.file.buffer.toString('base64'),
            mimetype: req.file.mimetype,
          },
          caption,
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
  };
}
