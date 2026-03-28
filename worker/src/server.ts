import { createServer } from "node:http";

import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();
const server = createServer(app);

async function start() {
  await prisma.$connect();

  server.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, "Worker started");
  });
}

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutdown signal received");

  server.close(async () => {
    await prisma.$disconnect();
    logger.info("Shutdown complete");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("Forced shutdown due to timeout");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

start().catch((error) => {
  logger.error({ err: error }, "Failed to start worker");
  process.exit(1);
});
