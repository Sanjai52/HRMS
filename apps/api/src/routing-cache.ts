import { RoutingCache } from "@hrms/core";
import { catalogPool } from "./db/pools.js";
import { poolFor, type ShardPool } from "./db/shards.js";

/**
 * Process-wide routing + identity snapshot (D-002). Refreshed from the registry
 * heartbeat while the catalog is healthy; during a catalog outage the last
 * snapshot keeps eligible shard-local operations resolving until the local
 * registration deadline, and the fence in front of every shard write stops
 * them after that.
 */
const cache = new RoutingCache(catalogPool);

/** Heartbeat hook. A failed refresh keeps the previous snapshot. */
export async function refreshRoutingCaches(): Promise<void> {
  try {
    await cache.refresh();
  } catch {
    // catalog unreachable — keep the last snapshot (bounded by the deadline)
  }
}

/** Diagnostics for tests and health endpoints. */
export function routingCacheState(): { mapVersion: number | null; identitySize: number } {
  return cache.state();
}

/** Shard + pool owning an employee, from the snapshot. */
export async function shardFor(employeeId: string): Promise<{ shard: string; pool: ShardPool } | null> {
  const shard = await cache.shardOf(employeeId);
  const pool = poolFor(shard);
  return pool ? { shard, pool } : null;
}

/** employee_id for the authenticated user, from the snapshot. */
export async function selfEmployeeId(userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  return cache.employeeIdOf(userId);
}
