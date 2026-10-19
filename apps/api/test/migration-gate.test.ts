import { describe, it, expect, beforeAll } from "vitest";
import { Pool } from "pg";
import { computeMap, VIRTUAL_NODES, withFencedWrite, GateClosedError } from "@hrms/core";
import { revertAfterSmokeFailure, setShardGates } from "../src/migration/runner.js";

const base = process.env.API_BASE ?? "http://localhost:4000";

const SHARD_URLS: Array<[string, string | undefined]> = [
  ["shard-1", process.env.DATABASE_SHARD_1_URL],
  ["shard-2", process.env.DATABASE_SHARD_2_URL],
  ["shard-3", process.env.DATABASE_SHARD_3_URL],
];

function requiredPool(url: string | undefined, label: string): Pool {
  expect(url, `missing ${label} url`).toBeTruthy();
  return new Pool({ connectionString: url });
}

function catalogPool(): Pool {
  return requiredPool(process.env.CATALOG_DATABASE_URL, "catalog");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function openShardGate(pool: Pool): Promise<void> {
  await pool.query("UPDATE shard_write_gate SET state = 'OPEN' WHERE id = 1");
}

async function materializeVersion(catalog: Pool, version: number, members: string): Promise<void> {
  await catalog.query("INSERT INTO routing_map_versions (version, members, virtual_nodes, active, domain) VALUES ($1,$2,$3,FALSE,'employee') ON CONFLICT (version) DO NOTHING", [version, members, VIRTUAL_NODES]);
  for (const [bucket, shard] of computeMap(members.split(","))) {
    await catalog.query("INSERT INTO routing_map_buckets (version, bucket_id, shard_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [version, bucket, shard]);
  }
}

async function dropVersion(catalog: Pool, version: number): Promise<void> {
  await catalog.query("DELETE FROM routing_map_buckets WHERE version = $1", [version]);
  await catalog.query("DELETE FROM routing_map_versions WHERE version = $1", [version]);
}

async function activeEmployeeVersion(catalog: Pool): Promise<{ version: number; members: string }> {
  // NOTE: core loadActiveMap does not filter by domain yet (Task 9), and a
  // candidate-domain row can be active with a higher version number; query the
  // employee rows directly so this suite never touches the candidate map.
  const r = await catalog.query("SELECT version, members FROM routing_map_versions WHERE domain = 'employee' AND active = TRUE ORDER BY version DESC LIMIT 1");
  expect(r.rows.length, "no active employee map").toBe(1);
  return { version: Number(r.rows[0].version), members: String(r.rows[0].members) };
}

describe("Phase 10b migration gates", () => {
  beforeAll(async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
  });

  it("(a) drain: a slow fenced write finishes before the gate closes; later writes see GateClosedError", async () => {
    const shard = "shard-1";
    const pool = requiredPool(process.env.DATABASE_SHARD_1_URL, shard);
    try {
      await openShardGate(pool);
      const epoch = Date.now();
      const events: string[] = [];
      let started = false;
      const slow = withFencedWrite(pool, async (client) => {
        started = true;
        await sleep(1500);
        await client.query("SELECT 1");
        events.push("fn-done");
        return "ok";
      });
      for (let i = 0; i < 200 && !started; i++) await sleep(10);
      expect(started).toBe(true);

      // The gate write shares the `shard-write` advisory lock, so it can only
      // complete after the slow fenced transaction commits.
      const gateClose = setShardGates([shard], "GATED", epoch).then(() => {
        events.push("gate-done");
      });
      await expect(slow).resolves.toBe("ok");
      await gateClose;
      expect(events).toEqual(["fn-done", "gate-done"]);

      const refused = await withFencedWrite(pool, async () => "nope").catch((e) => e);
      expect(refused).toBeInstanceOf(GateClosedError);
      expect((refused as GateClosedError).code).toBe("GATE_CLOSED");
    } finally {
      await openShardGate(pool);
      await pool.end();
    }
  }, 30000);

  it("(b) stale writer: a pool resolved via the old map still hits the fence after the map switched and the shard gated", async () => {
    const catalog = catalogPool();
    const before = await activeEmployeeVersion(catalog);
    const oldShard = computeMap(before.members.split(",")).get(7) as string;
    const shardUrl = SHARD_URLS.find(([id]) => id === oldShard)?.[1];
    const oldPool = requiredPool(shardUrl, oldShard);
    const toVersion = Number((await catalog.query("SELECT COALESCE(MAX(version), 0) + 1 AS v FROM routing_map_versions")).rows[0].v);
    let switched = false;
    try {
      // Materialize the post-cutover version and switch the active map.
      await materializeVersion(catalog, toVersion, before.members);
      await catalog.query("UPDATE routing_map_versions SET active = (version = $1) WHERE domain = 'employee'", [toVersion]);
      switched = true;
      const active = await catalog.query("SELECT version FROM routing_map_versions WHERE domain = 'employee' AND active");
      expect(Number(active.rows[0].version)).toBe(toVersion);

      // Gate the shard the stale writer resolved through the old map.
      const epoch = Date.now();
      await setShardGates([oldShard], "GATED", epoch);

      const refused = await withFencedWrite(oldPool, async () => "stale-write").catch((e) => e);
      expect(refused).toBeInstanceOf(GateClosedError);
      expect((refused as GateClosedError).code).toBe("GATE_CLOSED");
    } finally {
      if (switched) {
        await catalog.query("UPDATE routing_map_versions SET active = (version = $1) WHERE domain = 'employee'", [before.version]);
      }
      await openShardGate(oldPool);
      await dropVersion(catalog, toVersion);
      await oldPool.end();
      await catalog.end();
    }
  }, 30000);

  it("(c) rollback: a smoke failure reverts the map, reopens gates same-epoch and records ABORTED + audit", async () => {
    const catalog = catalogPool();
    const runId = `mgt-${Date.now()}`;
    const actor = "migration-gate-test";
    const before = await activeEmployeeVersion(catalog);
    const members = before.members;
    const toVersion = Number((await catalog.query("SELECT COALESCE(MAX(version), 0) + 1 AS v FROM routing_map_versions")).rows[0].v);
    const shard1 = requiredPool(process.env.DATABASE_SHARD_1_URL, "shard-1");
    const shard2 = requiredPool(process.env.DATABASE_SHARD_2_URL, "shard-2");
    const epoch = Date.now();
    try {
      // Simulate the post-cutover state: toVersion active, gates GATED at the
      // run epoch, and a run row past the smoke-ready phase.
      await materializeVersion(catalog, toVersion, members);
      await catalog.query("UPDATE routing_map_versions SET active = (version = $1) WHERE domain = 'employee'", [toVersion]);
      await catalog.query("UPDATE catalog_write_gate SET state = 'GATED', epoch = $1, updated_at = now() WHERE id = 1", [epoch]);
      await setShardGates(["shard-1", "shard-2"], "GATED", epoch);
      await catalog.query(
        "INSERT INTO migration_runs (run_id, from_version, to_version, new_shard, state, moved_buckets, epoch, current_step, created_by) VALUES ($1,$2,$3,'shard-4','ACKED',$4::jsonb,$5,'smoke',$6)",
        [runId, before.version, toVersion, JSON.stringify([{ from: "shard-1", to: "shard-2", bucket: 3 }]), epoch, actor]
      );

      await revertAfterSmokeFailure(runId, actor, new Error("smoke-map:3"));

      const active = await catalog.query("SELECT version FROM routing_map_versions WHERE domain = 'employee' AND active");
      expect(Number(active.rows[0].version)).toBe(before.version);

      const run = await catalog.query("SELECT state, current_step, error FROM migration_runs WHERE run_id = $1", [runId]);
      expect(run.rows[0].state).toBe("ABORTED");
      expect(run.rows[0].current_step).toBe("smoke_reverted");
      expect(String(run.rows[0].error)).toContain("smoke-map:3");

      for (const pool of [shard1, shard2]) {
        const gate = await pool.query("SELECT state, epoch FROM shard_write_gate WHERE id = 1");
        expect((gate.rows[0] as { state: string }).state).toBe("OPEN");
        expect(Number((gate.rows[0] as { epoch: number }).epoch)).toBe(epoch);
      }
      const catalogGate = await catalog.query("SELECT state, epoch FROM catalog_write_gate WHERE id = 1");
      expect((catalogGate.rows[0] as { state: string }).state).toBe("OPEN");
      expect(Number((catalogGate.rows[0] as { epoch: number }).epoch)).toBe(epoch);

      const audit = await catalog.query("SELECT actor, metadata FROM audit_logs WHERE action = 'migration.smoke_failed' AND resource = $1", [`migration:${runId}`]);
      expect(audit.rows).toHaveLength(1);
      expect((audit.rows[0] as { actor: string }).actor).toBe(actor);
    } finally {
      await catalog.query("UPDATE routing_map_versions SET active = (version = $1) WHERE domain = 'employee'", [before.version]);
      await catalog.query("UPDATE catalog_write_gate SET state = 'OPEN' WHERE id = 1");
      await openShardGate(shard1);
      await openShardGate(shard2);
      await catalog.query("DELETE FROM migration_runs WHERE run_id = $1", [runId]);
      await dropVersion(catalog, toVersion);
      await shard1.end();
      await shard2.end();
      await catalog.end();
    }
  }, 30000);
});
