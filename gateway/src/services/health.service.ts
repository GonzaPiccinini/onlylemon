import { getWebhookQueue } from "../config/bullmq.js";

export const checkBullMQHealth = async (): Promise<"up" | "down"> => {
  const queue = getWebhookQueue();

  try {
    await queue.waitUntilReady();
    return "up";
  } catch {
    return "down";
  }
};
