import type { NextFunction, Request, Response } from "express";

import { httpRequestDurationSeconds, httpRequestsTotal } from "../lib/metrics.js";

export function requestMetrics(req: Request, res: Response, next: NextFunction) {
  const end = httpRequestDurationSeconds.startTimer();

  res.on("finish", () => {
    const route = req.route?.path ?? req.path;
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode)
    };

    httpRequestsTotal.inc(labels);
    end(labels);
  });

  next();
}
