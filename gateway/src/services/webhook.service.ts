import { Request, Response } from 'express';
import { env } from '../config/env.js';
import { getWebhookQueue, getWebhookQueueStats } from '../config/bullmq.js';
import { logger } from '../lib/logger.js';
import {
  webhooksEnqueuedTotal,
  webhooksRejectedTotal,
} from '../lib/metrics.js';

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const webhookData = req.body;
    const queue = getWebhookQueue();

    const stats = await getWebhookQueueStats();

    if (stats.backlog >= env.queueMaxBacklog) {
      webhooksRejectedTotal.labels('queue_saturated').inc();
      logger.warn(
        { backlog: stats.backlog },
        'webhook_rejected: queue saturated',
      );
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

    webhooksEnqueuedTotal.labels(eventName).inc();
    logger.info({
      event: 'webhook_enqueued',
      requestId: res.getHeader('x-request-id') ?? null,
      queue: env.bullmqQueueName,
      jobId: job.id,
      eventType: eventName,
      backlog: stats.backlog,
    });

    res.status(200).json({ message: 'Webhook data stored successfully' });
  } catch (error) {
    webhooksRejectedTotal.labels('enqueue_error').inc();
    logger.error({
      event: 'webhook_enqueue_failed',
      requestId: res.getHeader('x-request-id') ?? null,
      err: error,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};
