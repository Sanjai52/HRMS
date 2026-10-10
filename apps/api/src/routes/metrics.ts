import { Router } from "express";
import client from "prom-client";

const httpRequests = new client.Counter({
  name: "hrms_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
});

const httpDuration = new client.Histogram({
  name: "hrms_http_request_seconds",
  help: "HTTP request duration",
  labelNames: ["method", "route"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
});

client.collectDefaultMetrics();

export function metricsMiddleware(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction): void {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const route = req.route?.path ?? req.path;
    const secs = Number(process.hrtime.bigint() - start) / 1e9;
    httpRequests.inc({ method: req.method, route, status: String(res.statusCode) });
    httpDuration.observe({ method: req.method, route }, secs);
  });
  next();
}

export const metricsRouter = Router();
metricsRouter.get("/metrics", async (_req, res) => {
  res.setHeader("content-type", client.register.contentType);
  res.send(await client.register.metrics());
});
