import { Router } from "express";
import { errorEnvelope, runDispatcherOnce, loadActiveMap, BullMqJobQueue } from "@hrms/core";
import { redisKv } from "../db/redis.js";
import { catalogPool } from "../db/pools.js";
import { allShardPools } from "../db/shards.js";

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
  const { map } = await loadActiveMap(catalogPool);
  const queue = new BullMqJobQueue(process.env.REDIS_QUEUE_URL ?? "redis://localhost:6379");
  try {
    const counts = await runDispatcherOnce({
      catalog: catalogPool,
      shards: Object.fromEntries(allShardPools().map(({ shard, pool }) => [shard, pool])),
      redis: redisKv(),
      map,
      enqueue: (name, data, opts) => queue.enqueue(name as "notification", data, opts),
    });
    res.json({ success: true, data: counts });
  } finally {
    await queue.close();
  }
});
