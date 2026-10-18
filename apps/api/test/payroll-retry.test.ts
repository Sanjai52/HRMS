import { describe, it, expect } from "vitest";
import { Pool } from "pg";
import { ACTIVE_SHARDS, runPayrollChunk } from "@hrms/core";

// Regression for Scenario E (Task 20): when a worker is killed mid-chunk and
// BullMQ redelivers the chunk after restart, the chunk must rewrite its own
// per-shard bookkeeping row instead of adding its row count to the batch
// totals a second time (which left the batch stuck in RUNNING forever).
const catalogUrl = process.env.CATALOG_DATABASE_URL;
const shardUrls: Record<string, string | undefined> = {
  "shard-1": process.env.DATABASE_SHARD_1_URL,
  "shard-2": process.env.DATABASE_SHARD_2_URL,
  "shard-3": process.env.DATABASE_SHARD_3_URL,
};
const hasDbs = !!catalogUrl && ACTIVE_SHARDS.every((s) => !!shardUrls[s]);

describe("Phase 5 payroll chunk retry bookkeeping", () => {
  it.skipIf(!hasDbs)("a redelivered chunk does not inflate batch totals (worker-kill retry)", async () => {
    const catalog = new Pool({ connectionString: catalogUrl });
    const shards: Record<string, Pool> = {};
    const batchId = `retrytest-${Date.now()}`;
    const period = "2026-07"; // not used by any other suite
    try {
      await catalog.query(
        "INSERT INTO payroll_batches (batch_id, period, status, created_by) VALUES ($1, $2, 'PENDING', 'payroll-retry-test')",
        [batchId, period]
      );
      for (const shard of ACTIVE_SHARDS) shards[shard] = new Pool({ connectionString: shardUrls[shard] });

      const read = async (): Promise<{ status: string; total: number; done: number; failed: number; skipped: number }> => {
        const r = await catalog.query("SELECT status, total, done, failed, skipped FROM payroll_batches WHERE batch_id = $1", [batchId]);
        return r.rows[0] as { status: string; total: number; done: number; failed: number; skipped: number };
      };

      // First delivery of the shard-1 chunk.
      await runPayrollChunk({ catalog, shard: shards["shard-1"] }, batchId, period, "shard-1");
      const first = await read();
      expect(first.total).toBeGreaterThan(0);
      expect(first.status).toBe("RUNNING");

      // Simulated redelivery of the same chunk after a kill mid-run: totals must not double.
      await runPayrollChunk({ catalog, shard: shards["shard-1"] }, batchId, period, "shard-1");
      const retried = await read();
      expect(retried.total).toBe(first.total);
      expect(retried.done).toBe(first.done);
      expect(retried.skipped).toBe(first.skipped);

      // The remaining chunks complete the batch.
      for (const shard of ACTIVE_SHARDS.filter((s) => s !== "shard-1")) {
        await runPayrollChunk({ catalog, shard: shards[shard] }, batchId, period, shard);
      }
      const final = await read();
      expect(["COMPLETED", "PARTIAL_FAILED"]).toContain(final.status);
      expect(final.done + final.failed + final.skipped).toBeGreaterThanOrEqual(final.total);
      expect(final.total).toBeGreaterThanOrEqual(retried.total);
    } finally {
      try {
        for (const shard of ACTIVE_SHARDS) {
          await shards[shard]?.query("DELETE FROM payroll_records WHERE record_id LIKE $1", [`${batchId}:%`]).catch(() => undefined);
          await shards[shard]?.query("DELETE FROM notifications WHERE notification_id LIKE $1", [`${batchId}:%`]).catch(() => undefined);
        }
        await catalog.query("DELETE FROM payroll_batch_shards WHERE batch_id = $1", [batchId]).catch(() => undefined);
        await catalog.query("DELETE FROM payroll_batches WHERE batch_id = $1", [batchId]).catch(() => undefined);
      } finally {
        for (const shard of ACTIVE_SHARDS) await shards[shard]?.end().catch(() => undefined);
        await catalog.end().catch(() => undefined);
      }
    }
  }, 30000);
});
