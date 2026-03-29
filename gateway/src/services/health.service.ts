import { env } from "../config/env.js";
import { getWebhookQueue, getWebhookQueueStats } from "../config/bullmq.js";

export type BullMQHealth = {
  bullmq: "up" | "down";
  queue: {
    waiting: number;
    delayed: number;
    active: number;
    failed: number;
    backlog: number;
  };
  availability: "ok" | "degraded";
};

export const checkBullMQHealth = async (): Promise<BullMQHealth> => {
  const queue = getWebhookQueue();

  try {
    await queue.waitUntilReady();
    const stats = await getWebhookQueueStats();

    return {
      bullmq: "up",
      queue: stats,
      availability: stats.backlog >= env.queueDegradedBacklog ? "degraded" : "ok"
    };
  } catch {
    return {
      bullmq: "down",
      queue: {
        waiting: 0,
        delayed: 0,
        active: 0,
        failed: 0,
        backlog: 0
      },
      availability: "degraded"
    };
  }
};
