import { loadActiveMap, resolveShard } from "@hrms/core";
import { catalogPool, shardPools } from "../db/pools.js";
import type { AuthedRequest } from "../middleware/auth.js";

export async function selfEmployeeId(req: AuthedRequest): Promise<string | null> {
  const u = await catalogPool.query("SELECT email_norm FROM users WHERE user_id = $1", [req.userId]);
  if (u.rows.length === 0) return null;
  const d = await catalogPool.query("SELECT employee_id FROM employee_directory WHERE email_norm = $1", [u.rows[0].email_norm]);
  return d.rows.length > 0 ? (d.rows[0].employee_id as string) : null;
}

export async function shardFor(employeeId: string): Promise<{ shard: string; pool: (typeof shardPools)[string] } | null> {
  const { map } = await loadActiveMap(catalogPool);
  const shard = resolveShard(employeeId, map);
  const pool = shardPools[shard];
  return pool ? { shard, pool } : null;
}

export async function ownedBuckets(): Promise<Record<string, number[]>> {
  const { map } = await loadActiveMap(catalogPool);
  const owned: Record<string, number[]> = {};
  for (const [bucket, shard] of map) {
    (owned[shard] ??= []).push(bucket);
  }
  return owned;
}
