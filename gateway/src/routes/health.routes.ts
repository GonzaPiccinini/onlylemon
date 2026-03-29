import { Router } from "express";
import { checkBullMQHealth } from "../services/health.service.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  try {
    const bullmq = await checkBullMQHealth();

    res.status(200).json({
      status: "ok",
      bullmq
    });
  } catch {
    res.status(503).json({
      status: "error",
      bullmq: "down"
    });
  }
});
