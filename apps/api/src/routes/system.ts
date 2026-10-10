import { Router } from "express";
import { errorEnvelope, runDispatcherOnce } from "@hrms/core";
import { redisKv } from "../db/redis.js";
import { catalogPool, shardPools } from "../db/pools.js";

export const systemRouter = Router();
systemRouter.post("/system/test/reset-limiter", async (_req, res) => {
  if (process.env.ALLOW_TEST_LIMITER_RESET !== "true") {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Not found"));
    return;
  }
  const redis = redisKv();
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "rl:*", "COUNT", 500);
    cursor = next;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== "0");
  res.json({ success: true, data: null });
});

systemRouter.post("/system/test/run-dispatcher", async (_req, res) => {
  if (process.env.ALLOW_TEST_LIMITER_RESET !== "true") {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Not found"));
    return;
  }
  const counts = await runDispatcherOnce({ catalog: catalogPool, shards: shardPools, redis: redisKv() });
  res.json({ success: true, data: counts });
});
