import {
  computeMap,
  diffMaps,
  MIGRATION_MANIFEST,
  VIRTUAL_NODES,
  loadActiveMap,
  type BucketMove,
} from "@hrms/core";
import { BullMqJobQueue, runDispatcherOnce } from "@hrms/core";
import { nextEventId } from "../ids.js";
import { catalogPool, shardPools } from "../db/pools.js";
import { redisKv } from "../db/redis.js";
import { writeAudit } from "../audit/audit.js";

const ALLOWED_NEW_SHARDS = ["shard-4"];
const ACK_TIMEOUT_MS = 35000;

export interface Preview {
  fromVersion: number;
  toVersion: number;
  members: string[];
  newShard: string;
  moves: BucketMove[];
}

export function allowedNewShard(id: string): boolean {
  return ALLOWED_NEW_SHARDS.includes(id) && !!shardPools[id];
}

async function setRun(runId: string, patch: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(patch);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await catalogPool.query(`UPDATE migration_runs SET ${sets}, updated_at = now() WHERE run_id = $1`, [runId, ...keys.map((k) => patch[k])]);
}

async function activeEmployeeVersion(): Promise<{ version: number; nextVersion: number; members: string[] }> {
  const r = await catalogPool.query("SELECT version, members FROM routing_map_versions WHERE domain = 'employee' AND active = TRUE");
  if (r.rows.length === 0) throw new Error("no-active-employee-map");
  const m = await catalogPool.query("SELECT COALESCE(MAX(version), 0) + 1 AS v FROM routing_map_versions");
  return { version: (r.rows[0] as { version: number }).version, nextVersion: Number((m.rows[0] as { v: string }).v), members: ((r.rows[0] as { members: string }).members).split(",") };
}

export async function previewNewShard(newShard: string): Promise<Preview> {
  if (!allowedNewShard(newShard)) throw new Error("unknown-shard");
  const { version, nextVersion, members } = await activeEmployeeVersion();
  if (members.includes(newShard)) throw new Error("already-member");
  const all = [...members, newShard];
  const oldMap = computeMap(members);
  const newMap = computeMap(all);
  const moves = diffMaps(oldMap, newMap);
  return { fromVersion: version, toVersion: nextVersion, members: all, newShard, moves };
}

export async function estimateMoves(moves: BucketMove[]): Promise<{ buckets: number; rows: number }> {
  const bySource: Record<string, number[]> = {};
  for (const m of moves) {
    (bySource[m.from] ??= []).push(m.bucket);
  }
  let rows = 0;
  for (const [shard, buckets] of Object.entries(bySource)) {
    const pool = shardPools[shard];
    if (!pool) continue;
    for (const t of MIGRATION_MANIFEST) {
      const r = await pool.query(`SELECT COUNT(*) AS c FROM ${t.table} WHERE bucket_id = ANY($1)`, [buckets]);
      rows += Number((r.rows[0] as { c: string }).c);
    }
  }
  return { buckets: moves.length, rows };
}

export async function setShardGates(shards: string[], state: "OPEN" | "GATED", epoch: number, casEpoch?: number): Promise<void> {
  for (const shard of [...shards].sort()) {
    const pool = shardPools[shard];
    if (!pool) throw new Error(`unknown-shard:${shard}`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('shard-write'))");
      if (casEpoch !== undefined) {
        const r = await client.query("UPDATE shard_write_gate SET state = $1 WHERE id = 1 AND state = 'GATED' AND epoch = $2", [state, casEpoch]);
        if (r.rowCount === 0) throw new Error(`gate-cas-failed:${shard}`);
      } else {
        await client.query("UPDATE shard_write_gate SET state = $1, epoch = $2, updated_at = now() WHERE id = 1", [state, epoch]);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }
}

async function waitAcks(predicate: (rows: Array<Record<string, unknown>>) => boolean, label: string): Promise<void> {
  const start = Date.now();
  for (;;) {
    const r = await catalogPool.query(
      "SELECT process_id, gate_epoch_ack, gate_epoch, map_version_loaded, expires_at FROM process_registry WHERE expires_at > now()"
    );
    if (predicate(r.rows as Array<Record<string, unknown>>)) return;
    if (Date.now() - start > ACK_TIMEOUT_MS) throw new Error(`ack-timeout:${label}`);
    await new Promise((r2) => setTimeout(r2, 500));
  }
}

async function drainOutbox(): Promise<void> {
  const queue = new BullMqJobQueue(process.env.REDIS_QUEUE_URL ?? "redis://localhost:6379");
  try {
    const { map } = await loadActiveMap(catalogPool);
    for (let i = 0; i < 30; i++) {
      const counts = await runDispatcherOnce({ catalog: catalogPool, shards: shardPools, redis: redisKv(), map, enqueue: (n, d, o) => queue.enqueue(n as "notification", d, o) });
      if (counts.delivered === 0) return;
    }
    throw new Error("outbox-drain-timeout");
  } finally {
    await queue.close().catch(() => undefined);
  }
}

async function copyMoves(moves: BucketMove[]): Promise<{ copied: number }> {
  const byPair: Record<string, { from: string; to: string; buckets: number[] }> = {};
  for (const m of moves) {
    const key = `${m.from}->${m.to}`;
    (byPair[key] ??= { from: m.from, to: m.to, buckets: [] }).buckets.push(m.bucket);
  }
  let copied = 0;
  for (const pair of Object.values(byPair)) {
    const src = shardPools[pair.from];
    const dst = shardPools[pair.to];
    if (!src || !dst) throw new Error(`unknown-shard-pair:${pair.from}->${pair.to}`);
    for (const t of MIGRATION_MANIFEST) {
      const rows = await src.query(`SELECT * FROM ${t.table} WHERE bucket_id = ANY($1)`, [pair.buckets]);
      for (let i = 0; i < rows.rows.length; i += 200) {
        const chunk = rows.rows.slice(i, i + 200) as Array<Record<string, unknown>>;
        for (const row of chunk) {
          const cols = Object.keys(row);
          const vals = cols.map((_, j) => `$${j + 1}`).join(", ");
          await dst.query(
            `INSERT INTO ${t.table} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${vals}) ON CONFLICT ${t.conflict} DO NOTHING`,
            cols.map((c) => row[c])
          );
        }
        copied += chunk.length;
      }
    }
  }
  return { copied };
}

async function checksum(pool: { query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> }, table: string, cols: string[], buckets: number[]): Promise<string> {
  const expr = `concat_ws('|', ${cols.map((c) => `"${c}"::text`).join(", ")})`;
  const r = await pool.query(
    `SELECT COUNT(*) AS c, md5(COALESCE(string_agg(s, ',' ORDER BY s), '')) AS h FROM (SELECT ${expr} AS s FROM "${table}" WHERE bucket_id = ANY($1)) q`,
    [buckets]
  );
  return `${(r.rows[0] as { c: string }).c}:${(r.rows[0] as { h: string }).h}`;
}

async function verifyMoves(moves: BucketMove[]): Promise<void> {
  const byPair: Record<string, { from: string; to: string; buckets: number[] }> = {};
  for (const m of moves) {
    const key = `${m.from}->${m.to}`;
    (byPair[key] ??= { from: m.from, to: m.to, buckets: [] }).buckets.push(m.bucket);
  }
  for (const pair of Object.values(byPair)) {
    const src = shardPools[pair.from];
    const dst = shardPools[pair.to];
    if (!src || !dst) throw new Error("unknown-shard-pair");
    for (const t of MIGRATION_MANIFEST) {
      const a = await checksum(src, t.table, t.checksumCols, pair.buckets);
      const b = await checksum(dst, t.table, t.checksumCols, pair.buckets);
      if (a !== b) throw new Error(`verify-mismatch:${t.table}:${pair.from}->${pair.to}`);
    }
  }
}

async function materializeVersion(version: number, members: string[]): Promise<void> {
  const map = computeMap(members);
  await catalogPool.query("INSERT INTO routing_map_versions (version, members, virtual_nodes, active, domain) VALUES ($1, $2, $3, FALSE, 'employee') ON CONFLICT (version) DO NOTHING", [version, members.join(","), VIRTUAL_NODES]);
  for (const [bucket, shard] of map) {
    await catalogPool.query("INSERT INTO routing_map_buckets (version, bucket_id, shard_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [version, bucket, shard]);
  }
}

async function smokeMoved(moves: BucketMove[], toVersion: number): Promise<void> {
  const rows = await catalogPool.query("SELECT bucket_id, shard_id FROM routing_map_buckets WHERE version = $1 LIMIT 1000", [toVersion]);
  const live = new Map<number, string>((rows.rows as Array<{ bucket_id: number; shard_id: string }>).map((r) => [r.bucket_id, r.shard_id]));
  const sample = moves.slice(0, 20);
  for (const m of sample) {
    const dest = live.get(m.bucket);
    if (dest !== m.to) throw new Error(`smoke-map:${m.bucket}`);
    const pool = shardPools[m.to];
    if (!pool) throw new Error("unknown-shard");
    await pool.query("SELECT 1 FROM employees WHERE bucket_id = $1 LIMIT 1", [m.bucket]);
  }
}

export async function startMigration(newShard: string, actor: string): Promise<string> {
  const active = await catalogPool.query("SELECT run_id FROM migration_runs WHERE state NOT IN ('COMPLETED','ABORTED','FAILED') LIMIT 1");
  if (active.rows.length > 0) throw new Error("migration-already-running");
  const preview = await previewNewShard(newShard);
  const runId = nextEventId();
  const epoch = Date.now();
  await catalogPool.query(
    "INSERT INTO migration_runs (run_id, from_version, to_version, new_shard, state, moved_buckets, epoch, current_step, created_by) VALUES ($1,$2,$3,$4,'PREPARING',$5,$6,'prepare',$7)",
    [runId, preview.fromVersion, preview.toVersion, newShard, JSON.stringify(preview.moves), epoch, actor]
  );
  await writeAudit(catalogPool, { actor, action: "migration.started", resource: `migration:${runId}`, metadata: { newShard } });
  runMigration(runId, preview, epoch, actor).catch((e) => {
    setRun(runId, { state: "FAILED", error: String((e as Error).message ?? e) }).catch(() => undefined);
  });
  return runId;
}

async function failRun(runId: string, step: string, err: unknown, actor: string): Promise<void> {
  // Terminal failure: gates are deliberately left as-is (still GATED on a
  // verify/checksum mismatch) so no write path reopens implicitly.
  await setRun(runId, { state: "FAILED", current_step: step, error: String((err as Error).message ?? err) });
  await writeAudit(catalogPool, { actor, action: "migration.failed", resource: `migration:${runId}`, metadata: { step } });
}

export async function abortRun(runId: string, actor: string): Promise<{ reopened: boolean }> {
  const r = await catalogPool.query("SELECT * FROM migration_runs WHERE run_id = $1", [runId]);
  if (r.rows.length === 0) throw new Error("unknown-run");
  const run = r.rows[0] as { state: string; epoch: number; to_version: number; new_shard: string; moved_buckets: BucketMove[]; current_step: string };
  if (["COMPLETED", "ABORTED", "FAILED"].includes(run.state)) return { reopened: false };
  // Refuse once copy/cutover began. NOTE: run phases live in `state`
  // (COPYING/VERIFYING/...) while `current_step` holds step names
  // (copy/verify/cutover/...) — both are checked so a mid-copy abort can
  // never slip through. The run row is left untouched and gates stay as-is;
  // recovery from here is explicit, never an implicit reopen.
  if (
    ["COPYING", "VERIFYING", "CUTOVER_COMMITTED", "ACKED", "WRITES_RESUMED"].includes(run.state) ||
    ["copy", "verify", "cutover", "resume"].includes(run.current_step)
  ) {
    await writeAudit(catalogPool, { actor, action: "migration.abort_refused", resource: `migration:${runId}`, metadata: { state: run.state, current_step: run.current_step } });
    return { reopened: false };
  }
  const involved = [...new Set(run.moved_buckets.flatMap((m) => [m.from, m.to]))];
  let reopened = true;
  try {
    await setShardGates(involved, "OPEN", run.epoch, run.epoch);
    await catalogPool.query("UPDATE catalog_write_gate SET state = 'OPEN' WHERE id = 1 AND state = 'GATED' AND epoch = $1", [run.epoch]);
  } catch {
    reopened = false;
  }
  await setRun(runId, { state: "ABORTED", current_step: "aborted" });
  await writeAudit(catalogPool, { actor, action: "migration.aborted", resource: `migration:${runId}` });
  return { reopened };
}

/**
 * Post-cutover smoke failure (Scenario K): the cutover is still the active map
 * and the gates are GATED, but the moved data fails the smoke check. Revert the
 * employee map to the pre-cutover version with a same-epoch CAS, record the
 * ABORTED run, audit the smoke failure, and reopen the shard + catalog gates
 * with the same-epoch CAS. A failed CAS (some other actor moved the epoch)
 * leaves that gate as-is: recovery stays explicit.
 */
export async function revertAfterSmokeFailure(runId: string, actor: string, smokeError?: unknown): Promise<void> {
  const r = await catalogPool.query("SELECT * FROM migration_runs WHERE run_id = $1", [runId]);
  if (r.rows.length === 0) throw new Error("unknown-run");
  const run = r.rows[0] as { epoch: number; from_version: number; to_version: number; moved_buckets: BucketMove[] };
  const involved = [...new Set(run.moved_buckets.flatMap((m) => [m.from, m.to]))];
  const message = smokeError === undefined ? "post-cutover smoke test failed" : String((smokeError as Error).message ?? smokeError);

  // (1) Revert the employee active map only if the toVersion is still active.
  await catalogPool.query(
    "UPDATE routing_map_versions SET active = (version = $1) WHERE domain = 'employee' AND EXISTS (SELECT 1 FROM routing_map_versions WHERE version = $2 AND active)",
    [run.from_version, run.to_version]
  );
  // (2) Record the terminal state.
  await setRun(runId, { state: "ABORTED", current_step: "smoke_reverted", error: `smoke-failed: ${message}` });
  // (3) Audit the smoke failure.
  await writeAudit(catalogPool, { actor, action: "migration.smoke_failed", resource: `migration:${runId}`, metadata: { fromVersion: run.from_version, toVersion: run.to_version, error: message } });
  // (4)+(5) Reopen the gates with the same-epoch CAS (as in abortRun, a CAS
  // mismatch leaves the gate as-is rather than reopening implicitly).
  try {
    await setShardGates(involved, "OPEN", run.epoch, run.epoch);
    await catalogPool.query("UPDATE catalog_write_gate SET state = 'OPEN' WHERE id = 1 AND state = 'GATED' AND epoch = $1", [run.epoch]);
  } catch {
    // gate CAS mismatch: the run is still recorded as ABORTED above
  }
}

async function runMigration(runId: string, preview: Preview, epoch: number, actor: string): Promise<void> {
  const started = Date.now();
  const metrics: Record<string, unknown> = { movedBuckets: preview.moves.length };
  const involved = [...new Set(preview.moves.flatMap((m) => [m.from, m.to]))];
  try {
    await setRun(runId, { state: "PREPARING", current_step: "prepare" });
    const dest = shardPools[preview.newShard];
    if (!dest) throw new Error("unknown-shard");
    await dest.query("SELECT 1 FROM schema_migrations");
    await materializeVersion(preview.toVersion, preview.members);

    await setRun(runId, { state: "GATED", current_step: "gate" });
    await catalogPool.query("UPDATE catalog_write_gate SET state = 'GATED', epoch = $1, updated_at = now() WHERE id = 1", [epoch]);
    await catalogPool.query("UPDATE process_registry SET gate_epoch = $1, gate_state = 'GATED' WHERE expires_at > now()", [epoch]);
    await setShardGates(involved, "GATED", epoch);
    await waitAcks(
      (rows) => rows.length > 0 && rows.every((r) => Number(r.gate_epoch_ack) >= epoch),
      "gate"
    );

    await setRun(runId, { current_step: "drain" });
    await drainOutbox();

    const est = await estimateMoves(preview.moves);
    metrics.estimatedRows = est.rows;
    await setRun(runId, { state: "COPYING", current_step: "copy", metrics });
    const { copied } = await copyMoves(preview.moves);
    metrics.copiedRows = copied;

    await setRun(runId, { state: "VERIFYING", current_step: "verify", metrics });
    await verifyMoves(preview.moves);

    await setRun(runId, { current_step: "cutover" });
    const mat = await catalogPool.query("SELECT COUNT(*) AS c FROM routing_map_buckets WHERE version = $1", [preview.toVersion]);
    if (Number((mat.rows[0] as { c: string }).c) !== 256) throw new Error(`map-not-materialized:${preview.toVersion}`);
    await catalogPool.query("UPDATE routing_map_versions SET active = (version = $1) WHERE domain = 'employee'", [preview.toVersion]);
    await setRun(runId, { state: "CUTOVER_COMMITTED", metrics });

    await waitAcks(
      (rows) => rows.length > 0 && rows.every((r) => Number(r.map_version_loaded) === preview.toVersion),
      "map"
    );
    await setRun(runId, { state: "ACKED" });
    try {
      await smokeMoved(preview.moves, preview.toVersion);
    } catch (e) {
      // Smoke failure after cutover: revert the map and reopen the gates
      // instead of the generic FAILED path (Scenario K).
      await revertAfterSmokeFailure(runId, actor, e);
      return;
    }

    await setRun(runId, { state: "WRITES_RESUMED", current_step: "resume" });
    await setShardGates(involved, "OPEN", epoch);
    await catalogPool.query("UPDATE catalog_write_gate SET state = 'OPEN', updated_at = now() WHERE id = 1");
    metrics.durationMs = Date.now() - started;
    metrics.writes503 = "see api metrics hrms_http_requests_total{code=503}";
    await setRun(runId, { state: "COMPLETED", current_step: "done", metrics });
    await writeAudit(catalogPool, { actor, action: "migration.completed", resource: `migration:${runId}`, metadata: metrics });
  } catch (e) {
    await failRun(runId, "run", e, actor);
  }
}
