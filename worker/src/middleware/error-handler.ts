import type { NextFunction, Request, Response } from "express";

import { config } from "../config/env.js";
import { logger } from "../lib/logger.js";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Not Found" });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  logger.error({ err }, "Unhandled error");

  res.status(500).json({
    error: "Internal Server Error",
    ...(config.isProduction ? {} : { details: err instanceof Error ? err.message : "Unknown error" })
  });
}
