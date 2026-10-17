import { shardPools } from "./pools.js";

/** Pool type for a shard connection, derived from the pool factory. */
export type ShardPool = (typeof shardPools)[string];

/** The pool for one shard id, or undefined when no such shard is configured. */
export function poolFor(shard: string): ShardPool | undefined {
  return shardPools[shard];
}

/**
 * Shards this deployment owns through the active routing map (1–3).
 * Route reads/writes must use this instead of touching `shardPools` directly.
 */
export function ownedShardPools(): Array<{ shard: string; pool: ShardPool }> {
  const out: Array<{ shard: string; pool: ShardPool }> = [];
  for (const shard of ["shard-1", "shard-2", "shard-3"]) {
    const pool = shardPools[shard];
    if (pool) out.push({ shard, pool });
  }
  return out;
}

/** Every configured shard, including standby shard-4 — diagnostics/admin use only. */
export function allShardPools(): Array<{ shard: string; pool: ShardPool }> {
  return Object.entries(shardPools).map(([shard, pool]) => ({ shard, pool }));
}
