import type { Request, Response, NextFunction } from "express";
import { errorEnvelope } from "@hrms/core";
import { kv } from "../db/redis.js";

export interface LimitSpec {
  capacity: number;
  windowMs: number;
  failOpen: boolean;
}

export function rateLimit(scope: string, spec: LimitSpec) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const bypass = (process.env.RATE_LIMIT_BYPASS_IPS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const ip = (req.ip ?? "").replace(/^::ffff:/, "");
    if (bypass.length > 0 && (bypass.includes(req.ip ?? "") || bypass.includes(ip))) {
      res.setHeader("x-ratelimit-bypass", "test");
      next();
      return;
    }
    const authed = req as Request & { userId?: string };
    const identity = authed.userId ?? req.ip ?? "anon";
    try {
      const r = await kv().takeToken(`${scope}:${identity}`, spec.capacity, spec.windowMs);
      res.setHeader("x-ratelimit-remaining", String(r.remaining));
      if (!r.allowed) {
        res.setHeader("retry-after", String(Math.ceil(r.retryAfterMs / 1000)));
        res.status(429).json(errorEnvelope("RATE_LIMITED", "Too many requests. Try again shortly."));
        return;
      }
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
export const searchLimit = rateLimit("search", { capacity: 60, windowMs: 60_000, failOpen: true });
export const publicApplyLimit = rateLimit("apply", { capacity: 10, windowMs: 60_000, failOpen: false });
export const shortLinkLimit = rateLimit("short", { capacity: 60, windowMs: 60_000, failOpen: false });
export const recoverLimit = rateLimit("recover", { capacity: 10, windowMs: 60_000, failOpen: false });
