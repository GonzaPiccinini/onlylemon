import { Router } from "express";
import { checkRedisHealth } from "../services/health.service.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  try {
    const redis = await checkRedisHealth();

    res.status(200).json({
      status: "ok",
      redis
    });
  } catch {
    res.status(503).json({
      status: "error",
      redis: "down"
    });
  }
});
