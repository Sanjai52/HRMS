import { Pool } from "pg";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing-env:${name}`);
  return v;
}

// `pg` pools are EventEmitters: an error on an *idle* client (shard restart,
// network blip, admin shutdown) is emitted on the pool and crashes the process
// when unhandled. Log it and keep running — the next query acquires a fresh
// client and fails on its own if the dependency is still down.
function guardPool(name: string, pool: Pool): Pool {
  pool.on("error", (err) => console.error(`pg pool ${name} idle client error:`, err.message));
  return pool;
}

export const catalogPool = guardPool("catalog", new Pool({ connectionString: required("CATALOG_DATABASE_URL"), max: 5 }));
export const shardPools: Record<string, Pool> = {
  "shard-1": guardPool("shard-1", new Pool({ connectionString: required("DATABASE_SHARD_1_URL"), max: 5 })),
  "shard-2": guardPool("shard-2", new Pool({ connectionString: required("DATABASE_SHARD_2_URL"), max: 5 })),
  "shard-3": guardPool("shard-3", new Pool({ connectionString: required("DATABASE_SHARD_3_URL"), max: 5 })),
  "shard-4": guardPool("shard-4", new Pool({ connectionString: required("DATABASE_SHARD_4_URL"), max: 2 })),
};
