import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";

const app = createApp();

const startServer = async (): Promise<void> => {
  try {
    await connectRedis();

    const server = app.listen(env.port, () => {
      console.info(`API listening on port ${env.port}`);
    });

    const gracefulShutdown = async (): Promise<void> => {
      server.close(async () => {
        await disconnectRedis();
        process.exit(0);
      });
    };

    process.on("SIGINT", gracefulShutdown);
    process.on("SIGTERM", gracefulShutdown);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

void startServer();
