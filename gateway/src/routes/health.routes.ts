import { Router } from "express";
import { checkBullMQHealth } from "../services/health.service.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  try {
    const health = await checkBullMQHealth();
    const httpStatus = health.bullmq === "down" ? 503 : 200;

    res.status(httpStatus).json({
      status: health.bullmq === "up" ? "ok" : "error",
      bullmq: health.bullmq,
      availability: health.availability,
      queue: health.queue
    });
  } catch {
    res.status(503).json({
      status: "error",
      bullmq: "down",
      availability: "degraded",
      queue: {
        waiting: 0,
        delayed: 0,
        active: 0,
        failed: 0,
        backlog: 0
      }
    });
  }
});
