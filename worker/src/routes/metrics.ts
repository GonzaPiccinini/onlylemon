import { Router } from "express";

import { register } from "../lib/metrics.js";

export const metricsRouter = Router();

metricsRouter.get("/metrics", async (_req, res, next) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    next(error);
  }
});
