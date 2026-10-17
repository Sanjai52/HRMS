import { buildRing, ownerOfBucket, VIRTUAL_NODES } from "./ring.js";
import { stableEmployeeBucket, BUCKET_COUNT } from "./bucket.js";

export const ACTIVE_SHARDS = ["shard-1", "shard-2", "shard-3"] as const;
export type ShardId = (typeof ACTIVE_SHARDS)[number];
export type ActiveMap = Map<number, string>;

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface PoolLike {
  connect(): Promise<PoolClientLike>;
}

export interface PoolClientLike extends Queryable {
  release(): void;
}

export function resolveShard(employeeId: string, activeMap: ActiveMap): string {
  const bucket = stableEmployeeBucket(employeeId);
  const shard = activeMap.get(bucket);
  if (!shard) throw new Error(`no-owner-for-bucket:${bucket}`);
  return shard;
}

export function canonicalBucketAndShard(employeeId: string, activeMap: ActiveMap): { bucket: number; shard: string } {
  const bucket = stableEmployeeBucket(employeeId);
  return { bucket, shard: resolveShard(employeeId, activeMap) };
}

export function buildMapV1(members: string[] = [...ACTIVE_SHARDS], v: number = VIRTUAL_NODES): Array<{ bucket: number; shard: string }> {
  const ring = buildRing(members, v);
  const rows: Array<{ bucket: number; shard: string }> = [];
  for (let b = 0; b < BUCKET_COUNT; b++) rows.push({ bucket: b, shard: ownerOfBucket(b, ring) });
  return rows;
}

export async function loadActiveMap(catalog: Queryable): Promise<{ version: number; map: ActiveMap }> {
  const v = await catalog.query("SELECT version FROM routing_map_versions WHERE domain = 'employee' AND active = TRUE ORDER BY version DESC LIMIT 1");
  if (v.rows.length === 0) throw new Error("no-active-routing-map");
  const version = v.rows[0].version as number;
  const r = await catalog.query("SELECT bucket_id, shard_id FROM routing_map_buckets WHERE version = $1", [version]);
  const map: ActiveMap = new Map();
  for (const row of r.rows) map.set(row.bucket_id as number, row.shard_id as string);
  if (map.size !== BUCKET_COUNT) throw new Error(`incomplete-routing-map:${map.size}`);
  return { version, map };
}

export async function seedRoutingMapV1(catalog: Queryable, members: string[] = [...ACTIVE_SHARDS]): Promise<number> {
  const rows = buildMapV1(members);
  await catalog.query("INSERT INTO routing_map_versions (version, members, virtual_nodes, active) VALUES (1, $1, $2, FALSE) ON CONFLICT (version) DO NOTHING", [members.join(","), VIRTUAL_NODES]);
  for (const row of rows) {
    await catalog.query(
      "INSERT INTO routing_map_buckets (version, bucket_id, shard_id) VALUES (1, $1, $2) ON CONFLICT DO NOTHING",
      [row.bucket, row.shard]
    );
  }
  await catalog.query("UPDATE routing_map_versions SET active = (version = 1)");
  return 1;
}

export class GateClosedError extends Error {
  status = 503;
  code = "GATE_CLOSED";
  constructor(epoch: number) {
    super(`shard-gated:${epoch}`);
  }
}

export async function withFencedWrite<T>(pool: PoolLike, fn: (client: PoolClientLike) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('shard-write'))");
    const g = await client.query("SELECT state, epoch FROM shard_write_gate WHERE id = 1");
    const state = g.rows[0]?.state as string;
    if (state === "GATED") {
      await client.query("ROLLBACK");
      throw new GateClosedError(g.rows[0].epoch as number);
    }
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // already rolled back
    }
    throw e;
  } finally {
    client.release();
  }
}
