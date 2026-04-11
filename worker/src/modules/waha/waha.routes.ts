import { Router } from 'express';
import { requireWhatsappWebhookToken } from '../security/webhook.middleware.js';
import { processWhatsappSessionStatusService } from '../cashier/cashier.service.js';
import { z } from 'zod';

const whatsappSessionStatusWebhookSchema = z.object({
  event: z.literal('session.status'),
  session: z.string().trim().min(1),
  timestamp: z.coerce.number().optional(),
  payload: z.object({
    status: z.enum([
      'STOPPED',
      'STARTING',
      'SCAN_QR_CODE',
      'WORKING',
      'FAILED',
    ]),
    statuses: z
      .array(
        z.object({
          status: z.enum([
            'STOPPED',
            'STARTING',
            'SCAN_QR_CODE',
            'WORKING',
            'FAILED',
          ]),
          timestamp: z.coerce.number(),
        }),
      )
      .optional(),
  }),
});

export const wahaRouter = Router();

wahaRouter.post(
  '/events/session-status',
  requireWhatsappWebhookToken,
  async (req, res) => {
    const parsed = whatsappSessionStatusWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: parsed.error.flatten(),
      });
    }
    console.log(parsed);
    const latestTimestamp =
      parsed.data.payload.statuses?.at(-1)?.timestamp ??
      parsed.data.timestamp ??
      Date.now();

    const result = await processWhatsappSessionStatusService(
      parsed.data.session,
      parsed.data.payload.status,
      new Date(latestTimestamp),
    );

    return res.status(202).json({
      received: true,
      ...result,
    });
  },
);
