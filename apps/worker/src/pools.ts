import { Pool } from "pg";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing-env:${name}`);
  return v;
}

export const catalogPool = new Pool({ connectionString: required("CATALOG_DATABASE_URL"), max: 5 });
export const shardPools: Record<string, Pool> = {
  "shard-1": new Pool({ connectionString: required("DATABASE_SHARD_1_URL"), max: 5 }),
  "shard-2": new Pool({ connectionString: required("DATABASE_SHARD_2_URL"), max: 5 }),
  "shard-3": new Pool({ connectionString: required("DATABASE_SHARD_3_URL"), max: 5 }),
  "shard-4": new Pool({ connectionString: required("DATABASE_SHARD_4_URL"), max: 2 }),
};
