import { getRedisClient } from "../config/redis.js";

export const checkRedisHealth = async (): Promise<"up" | "down"> => {
  const client = getRedisClient();

  if (!client.isOpen) {
    return "down";
  }

  await client.ping();
  return "up";
};
