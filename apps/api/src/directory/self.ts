import { loadActiveMap } from "@hrms/core";
import { catalogPool } from "../db/pools.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { selfEmployeeId as snapshotSelfEmployeeId, shardFor as snapshotShardFor } from "../routing-cache.js";

/**
 * Identity/routing lookups for authenticated users and shard-local writes.
 * Served from the process snapshot (D-002) so eligible shard-local operations
 * survive a catalog outage until the local registration deadline; see
 * apps/api/src/routing-cache.ts.
 */
export async function selfEmployeeId(req: AuthedRequest): Promise<string | null> {
  return snapshotSelfEmployeeId(req.userId);
}

export async function shardFor(employeeId: string): Promise<Awaited<ReturnType<typeof snapshotShardFor>>> {
  return snapshotShardFor(employeeId);
}

export async function ownedBuckets(): Promise<Record<string, number[]>> {
  const { map } = await loadActiveMap(catalogPool);
  const owned: Record<string, number[]> = {};
  for (const [bucket, shard] of map) {
    (owned[shard] ??= []).push(bucket);
  }
  return owned;
}
