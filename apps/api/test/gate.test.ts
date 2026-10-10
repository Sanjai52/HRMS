import { describe, it, expect } from "vitest";
import { Pool } from "pg";
import { withFencedWrite, GateClosedError } from "@hrms/core";

const url = process.env.DATABASE_SHARD_1_URL;
const describeIf = url ? describe : describe.skip;

describeIf("shard write gate (shard-1)", () => {
  it("rejects writes while GATED and accepts while OPEN", async () => {
    const pool = new Pool({ connectionString: url });
    try {
      await pool.query("UPDATE shard_write_gate SET state = 'GATED', epoch = 7 WHERE id = 1");
      await expect(
        withFencedWrite(pool, async (c) => c.query("SELECT 1"))
      ).rejects.toBeInstanceOf(GateClosedError);
      await pool.query("UPDATE shard_write_gate SET state = 'OPEN', epoch = 7 WHERE id = 1");
      await expect(
        withFencedWrite(pool, async (c) => {
          const r = await c.query("SELECT 1 AS one");
          return r.rows[0].one;
        })
      ).resolves.toBe(1);
    } finally {
      await pool.query("UPDATE shard_write_gate SET state = 'OPEN' WHERE id = 1");
      await pool.end();
    }
  });
});
