import { Request, Response } from 'express';
import { env } from '../config/env.js';
import { getWebhookQueue, getWebhookQueueStats } from '../config/bullmq.js';

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const webhookData = req.body;
    const queue = getWebhookQueue();

    const stats = await getWebhookQueueStats();

    if (stats.backlog >= env.queueMaxBacklog) {
      res.status(429).json({
        error: 'Queue is saturated, retry later',
        backlog: stats.backlog,
      });
      return;
    }

    const eventName =
      typeof webhookData === 'object' &&
      webhookData !== null &&
      'event' in webhookData &&
      typeof (webhookData as { event?: unknown }).event === 'string'
        ? (webhookData as { event: string }).event
        : 'message';

    const job = await queue.add(eventName, webhookData, {
      removeOnComplete: 1000, // Keep the most recent 1000 completed jobs for monitoring
      removeOnFail: 5000, // Keep the most recent 5000 failed jobs for monitoring
      attempts: 3, // Retry up to 3 times on failure
      backoff: {
        type: 'exponential', // Exponential backoff strategy for retries
        delay: 1000, // Initial delay of 1 second before the first retry, will double with each attempt
      },
    });

    console.info(
      JSON.stringify({
        level: 'info',
        event: 'webhook_enqueued',
        requestId: res.getHeader('x-request-id') ?? null,
        queue: env.bullmqQueueName,
        jobId: job.id,
        backlog: stats.backlog,
      }),
    );

    res.status(200).json({ message: 'Webhook data stored successfully' });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'webhook_enqueue_failed',
        requestId: res.getHeader('x-request-id') ?? null,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    res.status(500).json({ error: 'Internal server error' });
  }
};
