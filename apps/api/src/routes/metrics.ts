import { Router } from "express";
import client from "prom-client";
import { errorEnvelope } from "@hrms/core";

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

/**
 * `/metrics` is scraped by Prometheus from the compose network, never by the
 * public ingress. Access is decided from the raw socket peer — deliberately
 * not `req.ip` or forwarded headers — so a client can never spoof its way in.
 * Loopback and RFC1918/ULA/link-local peers are allowed; everything else gets
 * 403 unless it presents `METRICS_TOKEN` (x-metrics-token header).
 */
export function metricsPeerAllowed(peer: string | undefined): boolean {
  if (!peer) return false;
  const addr = peer.replace(/^::ffff:/, "");
  if (addr === "::1" || addr.startsWith("127.")) return true;
  if (addr.startsWith("10.") || addr.startsWith("192.168.")) return true;
  const bridge = /^172\.(\d{1,3})\./.exec(addr);
  if (bridge) {
    const second = Number(bridge[1]);
    if (second >= 16 && second <= 31) return true;
  }
  // IPv6 unique-local fc00::/7 and link-local fe80::/10
  if (/^f[cd][0-9a-f]{0,2}:/i.test(addr) || /^fe[89ab][0-9a-f]{0,2}:/i.test(addr)) return true;
  return false;
}

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
metricsRouter.get("/metrics", async (req, res) => {
  const token = process.env.METRICS_TOKEN;
  const tokenOk = typeof token === "string" && token.length > 0 && req.headers["x-metrics-token"] === token;
  if (!tokenOk && !metricsPeerAllowed(req.socket.remoteAddress ?? undefined)) {
    res.status(403).json(errorEnvelope("FORBIDDEN", "Metrics are restricted to the internal network"));
    return;
  }
  res.setHeader("content-type", client.register.contentType);
  res.send(await client.register.metrics());
});
