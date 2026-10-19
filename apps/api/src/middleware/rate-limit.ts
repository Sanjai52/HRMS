import type { Request, Response, NextFunction } from "express";
import client from "prom-client";
import { errorEnvelope } from "@hrms/core";
import { kv } from "../db/redis.js";

export interface LimitSpec {
  capacity: number;
  windowMs: number;
  failOpen: boolean;
}

// Hoisted once per process: env parsing must not happen on every request.
// `RATE_LIMIT_BYPASS_IPS` is test-only and is ignored entirely in production.
const bypassEnv = (process.env.RATE_LIMIT_BYPASS_IPS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const BYPASS_IPS: string[] = process.env.APP_ENV === "production" ? [] : bypassEnv;
if (process.env.APP_ENV === "production" && bypassEnv.length > 0) {
  console.warn("RATE_LIMIT_BYPASS_IPS is ignored when APP_ENV=production");
}

export const rateLimitAllowed = new client.Counter({
  name: "rate_limit_allowed_total",
  help: "Rate-limited requests admitted, by scope",
  labelNames: ["scope"],
});

export const rateLimitRejected = new client.Counter({
  name: "rate_limit_rejected_total",
  help: "Rate-limited requests rejected with 429, by scope",
  labelNames: ["scope"],
});

export function rateLimit(scope: string, spec: LimitSpec) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = (req.ip ?? "").replace(/^::ffff:/, "");
    if (BYPASS_IPS.length > 0 && (BYPASS_IPS.includes(req.ip ?? "") || BYPASS_IPS.includes(ip))) {
      res.setHeader("x-ratelimit-bypass", "test");
      rateLimitAllowed.inc({ scope });
      next();
      return;
    }
    const authed = req as Request & { userId?: string };
    const identity = authed.userId ?? req.ip ?? "anon";
    try {
      const r = await kv().takeToken(`${scope}:${identity}`, spec.capacity, spec.windowMs);
      res.setHeader("x-ratelimit-remaining", String(r.remaining));
      if (!r.allowed) {
        rateLimitRejected.inc({ scope });
        res.setHeader("retry-after", String(Math.ceil(r.retryAfterMs / 1000)));
        res.status(429).json(errorEnvelope("RATE_LIMITED", "Too many requests. Try again shortly."));
        return;
      }
      rateLimitAllowed.inc({ scope });
      next();
    } catch {
      if (spec.failOpen) {
        next();
        return;
      }
      res.status(503).json(errorEnvelope("LIMITER_UNAVAILABLE", "Request throttling is unavailable. Try again shortly."));
    }
  };
}

export const loginLimit = rateLimit("login", { capacity: 30, windowMs: 60_000, failOpen: false });
export const acceptLimit = rateLimit("accept", { capacity: 10, windowMs: 60_000, failOpen: false });
export const searchLimit = rateLimit("search", { capacity: 60, windowMs: 60_000, failOpen: true });
export const suggestLimit = rateLimit("suggest", { capacity: 120, windowMs: 60_000, failOpen: true });
export const publicJobsLimit = rateLimit("jobs", { capacity: 60, windowMs: 60_000, failOpen: true });
export const crawlLimit = rateLimit("crawl", { capacity: 6, windowMs: 60_000, failOpen: true });
export const publicApplyLimit = rateLimit("apply", { capacity: 10, windowMs: 60_000, failOpen: false });
export const shortLinkLimit = rateLimit("short", { capacity: 60, windowMs: 60_000, failOpen: false });
export const recoverLimit = rateLimit("recover", { capacity: 10, windowMs: 60_000, failOpen: false });
