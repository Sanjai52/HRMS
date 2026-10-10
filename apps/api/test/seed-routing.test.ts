import { describe, it, expect } from "vitest";
import { Pool } from "pg";
import { stableEmployeeBucket } from "@hrms/core";

const catalogUrl = process.env.CATALOG_DATABASE_URL;
const shardUrls: Record<string, string | undefined> = {
  "shard-1": process.env.DATABASE_SHARD_1_URL,
  "shard-2": process.env.DATABASE_SHARD_2_URL,
  "shard-3": process.env.DATABASE_SHARD_3_URL,
  "shard-4": process.env.DATABASE_SHARD_4_URL,
};
const describeIf = catalogUrl && shardUrls["shard-1"] ? describe : describe.skip;

describeIf("seeded-row bucket/routing", () => {
  it("every employee row recomputes to its stored bucket and lives on the active-map owner", async () => {
    const catalog = new Pool({ connectionString: catalogUrl });
    const mapRes = await catalog.query("SELECT bucket_id, shard_id FROM routing_map_buckets WHERE version = 1");
    const map = new Map<number, string>(mapRes.rows.map((r) => [r.bucket_id as number, r.shard_id as string]));
    for (const [shardId, url] of Object.entries(shardUrls)) {
      if (!url || shardId === "shard-4") continue;
      const pool = new Pool({ connectionString: url });
      const rows = await pool.query("SELECT employee_id, bucket_id FROM employees");
      for (const row of rows.rows as Array<{ employee_id: string; bucket_id: number }>) {
        expect(stableEmployeeBucket(row.employee_id)).toBe(row.bucket_id);
        expect(map.get(row.bucket_id)).toBe(shardId);
      }
      await pool.end();
    }
    await catalog.end();
  });
});
