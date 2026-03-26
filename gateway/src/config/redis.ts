import { createClient, type RedisClientType } from "redis";
import { env } from "./env.js";

let redisClient: RedisClientType | null = null;

export const getRedisClient = (): RedisClientType => {
  if (!redisClient) {
    redisClient = createClient({
      url: env.redisUrl
    });

    redisClient.on("error", (error) => {
      console.error("Redis error:", error);
    });
  }

  return redisClient;
};

export const connectRedis = async (): Promise<void> => {
  const client = getRedisClient();

  if (!client.isOpen) {
    await client.connect();
    console.info("Redis connected");
  }
};

export const disconnectRedis = async (): Promise<void> => {
  if (redisClient?.isOpen) {
    await redisClient.quit();
    console.info("Redis disconnected");
  }
};
