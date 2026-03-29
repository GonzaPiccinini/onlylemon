import { Queue } from "bullmq";
import { env } from "./env.js";

let queue: Queue | null = null;

const buildConnection = () => {
  const url = new URL(env.bullmqRedisUrl);
  const port = Number(url.port || "6379");

  return {
    host: url.hostname,
    port,
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number(url.pathname.replace("/", "") || "0")
  };
};

export const getWebhookQueue = (): Queue => {
  if (!queue) {
    queue = new Queue(env.bullmqQueueName, {
      connection: buildConnection()
    });

    queue.on("error", (error) => {
      console.error("BullMQ queue error:", error);
    });
  }

  return queue;
};

export const connectBullMQ = async (): Promise<void> => {
  const webhookQueue = getWebhookQueue();
  await webhookQueue.waitUntilReady();
  console.info("BullMQ connected");
};

export const disconnectBullMQ = async (): Promise<void> => {
  if (!queue) {
    return;
  }

  await queue.close();
  queue = null;
  console.info("BullMQ disconnected");
};
