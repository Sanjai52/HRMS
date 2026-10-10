import type { Request, Response, NextFunction } from "express";
import { errorEnvelope, TokenBucket } from "@hrms/core";
import { redisKv } from "../db/redis.js";

export interface LimitSpec {
  capacity: number;
  windowMs: number;
  failOpen: boolean;
}

let bucket: TokenBucket | null = null;

function limiter(): TokenBucket {
  if (!bucket) bucket = new TokenBucket(redisKv(), "rl");
  return bucket;
}

export function rateLimit(scope: string, spec: LimitSpec) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authed = req as Request & { userId?: string };
    const identity = authed.userId ?? req.ip ?? "anon";
    try {
      const r = await limiter().take(`${scope}:${identity}`, spec.capacity, spec.windowMs);
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
