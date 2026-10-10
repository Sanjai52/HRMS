import { Router } from "express";
import { catalogPool, shardPools } from "../db/pools.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const checks: Record<string, string> = {};
  try {
    await catalogPool.query("SELECT 1");
    checks.catalog = "up";
  } catch {
    checks.catalog = "down";
  }
  for (const [id, pool] of Object.entries(shardPools)) {
    try {
      const r = await pool.query("SELECT state FROM shard_write_gate WHERE id = 1");
      checks[id] = `up:${r.rows[0].state}`;
    } catch {
      checks[id] = "down";
    }
  }
  res.json({ success: true, data: checks });
});

healthRouter.get("/system/map-version", async (_req, res) => {
  const r = await catalogPool.query("SELECT version, members FROM routing_map_versions WHERE active = TRUE");
  res.json({ success: true, data: r.rows[0] ?? null });
});
