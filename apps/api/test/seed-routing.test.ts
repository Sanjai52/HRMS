import { describe, it, expect } from "vitest";
import { Pool } from "pg";
import { loadActiveMap, stableEmployeeBucket } from "@hrms/core";

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

  it("seeds an active candidate map whose version outranks the employee map, confined to shards 1-3", async () => {
    const catalog = new Pool({ connectionString: catalogUrl });
    const cand = await catalog.query("SELECT version FROM routing_map_versions WHERE domain = 'candidate' AND active = TRUE ORDER BY version DESC LIMIT 1");
    expect(cand.rows.length).toBe(1);
    const emp = await catalog.query("SELECT version FROM routing_map_versions WHERE domain = 'employee' AND active = TRUE ORDER BY version DESC LIMIT 1");
    expect(cand.rows[0].version as number).toBeGreaterThan(emp.rows[0].version as number);
    const rows = await catalog.query("SELECT bucket_id, shard_id FROM routing_map_buckets WHERE version = $1", [cand.rows[0].version]);
    expect(rows.rows.length).toBe(256);
    for (const row of rows.rows) {
      expect(["shard-1", "shard-2", "shard-3"]).toContain(row.shard_id as string);
      expect(row.shard_id).not.toBe("shard-4");
    }
    await catalog.end();
  });

  it("loadActiveMap returns the employee version, never the outranking candidate map", async () => {
    const catalog = new Pool({ connectionString: catalogUrl });
    const { version, map } = await loadActiveMap(catalog);
    const emp = await catalog.query("SELECT version FROM routing_map_versions WHERE domain = 'employee' AND active = TRUE ORDER BY version DESC LIMIT 1");
    expect(version).toBe(emp.rows[0].version as number);
    expect(map.size).toBe(256);
    const rows = await catalog.query("SELECT bucket_id, shard_id FROM routing_map_buckets WHERE version = $1", [version]);
    for (const row of rows.rows) expect(map.get(row.bucket_id as number)).toBe(row.shard_id);
    await catalog.end();
  });
});
