import { Pool } from "pg";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing-env:${name}`);
  return v;
}

// A hung shard must not exhaust its pool: fail fast on connect, cap individual
// queries, and release idle clients quickly so other requests can use the slots.
const POOL_TIMEOUTS = { connectionTimeoutMillis: 2000, query_timeout: 5000, idleTimeoutMillis: 10000 };

// `pg` pools are EventEmitters: an error on an *idle* client (shard restart,
// network blip, admin shutdown) is emitted on the pool and crashes the process
// when unhandled. Log it and keep serving — requests that need the shard fail
// on their own query error (mapped to 503 by the error handler in index.ts).
function guardPool(name: string, pool: Pool): Pool {
  pool.on("error", (err) => console.error(`pg pool ${name} idle client error:`, err.message));
  return pool;
}

export const catalogPool = guardPool("catalog", new Pool({ connectionString: required("CATALOG_DATABASE_URL"), max: 10, ...POOL_TIMEOUTS }));
export const shardPools: Record<string, Pool> = {
  "shard-1": guardPool("shard-1", new Pool({ connectionString: required("DATABASE_SHARD_1_URL"), max: 10, ...POOL_TIMEOUTS })),
  "shard-2": guardPool("shard-2", new Pool({ connectionString: required("DATABASE_SHARD_2_URL"), max: 10, ...POOL_TIMEOUTS })),
  "shard-3": guardPool("shard-3", new Pool({ connectionString: required("DATABASE_SHARD_3_URL"), max: 10, ...POOL_TIMEOUTS })),
  "shard-4": guardPool("shard-4", new Pool({ connectionString: required("DATABASE_SHARD_4_URL"), max: 5, ...POOL_TIMEOUTS })),
};
