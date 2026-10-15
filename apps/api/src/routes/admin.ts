import { Router } from "express";
import { errorEnvelope, prefixesFor, suggestKey, suggestMember, AUTOCOMPLETE_TOP_K } from "@hrms/core";
import { catalogPool, shardPools } from "../db/pools.js";
import { redisKv } from "../db/redis.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";
import { writeAudit } from "../audit/audit.js";
import { previewNewShard, estimateMoves, startMigration, abortRun, allowedNewShard } from "../migration/runner.js";

export const adminRouter = Router();

adminRouter.get("/audit-logs", requireAuth, requireRoles("ADMIN"), async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const action = typeof req.query.action === "string" ? req.query.action : null;
  const rows = action
    ? await catalogPool.query("SELECT event_id, actor, action, resource, timestamp, metadata FROM audit_logs WHERE action = $1 ORDER BY timestamp DESC LIMIT $2", [action, limit])
    : await catalogPool.query("SELECT event_id, actor, action, resource, timestamp, metadata FROM audit_logs ORDER BY timestamp DESC LIMIT $1", [limit]);
  res.json({ success: true, data: rows.rows });
});

adminRouter.get("/audit-logs/:eventId", requireAuth, requireRoles("ADMIN"), async (req, res) => {
  const rows = await catalogPool.query("SELECT event_id, actor, action, resource, timestamp, metadata FROM audit_logs WHERE event_id = $1", [req.params.eventId]);
  if (rows.rows.length === 0) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Audit event not found"));
    return;
  }
  res.json({ success: true, data: rows.rows[0] });
});

adminRouter.post("/rebuild-directory", requireAuth, requireRoles("ADMIN"), async (req: AuthedRequest, res) => {
  const redis = redisKv();
  let repaired = 0;
  for (const [shardId, pool] of Object.entries(shardPools)) {
    if (shardId === "shard-4") continue;
    const rows = await pool.query("SELECT employee_id, email, name, department, designation, status, version FROM employees");
    for (const r of rows.rows as Array<{ employee_id: string; email: string; name: string; department: string; designation: string; status: string; version: number }>) {
      if (r.status === "ACTIVE") {
        const up = await catalogPool.query(
          `INSERT INTO employee_directory (employee_id, email, email_norm, name, department, designation, status, version)
           VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7)
           ON CONFLICT (employee_id) DO UPDATE SET email = EXCLUDED.email, email_norm = EXCLUDED.email_norm,
             name = EXCLUDED.name, department = EXCLUDED.department, designation = EXCLUDED.designation,
             status = 'ACTIVE', version = EXCLUDED.version, updated_at = now()
           WHERE employee_directory.version <= EXCLUDED.version RETURNING employee_id`,
          [r.employee_id, r.email, r.email.toLowerCase(), r.name, r.department, r.designation, r.version]
        );
        repaired += up.rows.length;
        const member = suggestMember(r.employee_id, r.name, r.department);
        for (const prefix of new Set([...prefixesFor(r.name), ...prefixesFor(r.email)])) {
          const key = suggestKey(prefix);
          await redis.zadd(key, Date.now().toString(), member);
          await redis.zremrangebyrank(key, 0, -(AUTOCOMPLETE_TOP_K + 1));
        }
      } else {
        const del = await catalogPool.query("DELETE FROM employee_directory WHERE employee_id = $1", [r.employee_id]);
        repaired += del.rowCount ?? 0;
      }
    }
  }
  await writeAudit(catalogPool, {
    actor: req.userId ?? "",
    action: "directory.rebuilt",
    resource: "employee_directory",
    metadata: { repaired },
  });
  res.json({ success: true, data: { repaired } });
});

adminRouter.get("/shards", requireAuth, requireRoles("ADMIN"), async (_req, res) => {
  const versions = await catalogPool.query("SELECT version, domain, members, active FROM routing_map_versions ORDER BY domain, version");
  const gates: Record<string, unknown> = {};
  for (const [id, pool] of Object.entries(shardPools)) {
    try {
      const r = await pool.query("SELECT state, epoch FROM shard_write_gate WHERE id = 1");
      const counts = await pool.query("SELECT (SELECT COUNT(*) FROM employees) AS employees, (SELECT COUNT(*) FROM outbox_events WHERE delivered_at IS NULL) AS pending_outbox");
      gates[id] = { ...(r.rows[0] as object), ...(counts.rows[0] as object) };
    } catch {
      gates[id] = { state: "UNREACHABLE" };
    }
  }
  const registry = await catalogPool.query("SELECT process_id, kind, owner, heartbeat_at, expires_at, map_version_loaded, gate_epoch_ack, gate_state FROM process_registry WHERE expires_at > now() ORDER BY kind");
  const runs = await catalogPool.query("SELECT run_id, new_shard, state, current_step, created_at, updated_at FROM migration_runs ORDER BY created_at DESC LIMIT 10");
  res.json({ success: true, data: { versions: versions.rows, gates, registry: registry.rows, runs: runs.rows } });
});

adminRouter.post("/shards/preview", requireAuth, requireRoles("ADMIN"), async (req: AuthedRequest, res) => {
  const { newShard } = req.body as { newShard?: string };
  if (typeof newShard !== "string" || !allowedNewShard(newShard)) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Only preconfigured standby shards can be added"));
    return;
  }
  try {
    const preview = await previewNewShard(newShard);
    const est = await estimateMoves(preview.moves);
    res.json({ success: true, data: { fromVersion: preview.fromVersion, toVersion: preview.toVersion, members: preview.members, newShard, movedBuckets: preview.moves, moves: preview.moves.length, estimatedRows: est.rows } });
  } catch (e) {
    res.status(400).json(errorEnvelope("PREVIEW_FAILED", (e as Error).message));
    return;
  }
});

adminRouter.post("/shards/migrate", requireAuth, requireRoles("ADMIN"), async (req: AuthedRequest, res) => {
  const { newShard } = req.body as { newShard?: string };
  if (typeof newShard !== "string" || !allowedNewShard(newShard)) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Only preconfigured standby shards can be added"));
    return;
  }
  try {
    const runId = await startMigration(newShard, req.userId ?? "");
    res.status(202).json({ success: true, data: { runId } });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "unknown-shard" || msg === "already-member") {
      res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Only preconfigured standby shards can be added"));
      return;
    }
    res.status(409).json(errorEnvelope("MIGRATION_RUNNING", msg));
  }
});

adminRouter.get("/shards/runs/:id", requireAuth, requireRoles("ADMIN"), async (req, res) => {
  const r = await catalogPool.query("SELECT * FROM migration_runs WHERE run_id = $1", [req.params.id]);
  if (r.rows.length === 0) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Migration run not found"));
    return;
  }
  res.json({ success: true, data: r.rows[0] });
});

adminRouter.post("/shards/runs/:id/abort", requireAuth, requireRoles("ADMIN"), async (req: AuthedRequest, res) => {
  try {
    const out = await abortRun(req.params.id, req.userId ?? "");
    res.json({ success: true, data: out });
  } catch (e) {
    res.status(400).json(errorEnvelope("ABORT_FAILED", (e as Error).message));
  }
});

adminRouter.get("/settings/lookups", requireAuth, requireRoles("HR", "ADMIN"), async (_req, res) => {
  const [depts, desigs, policies, holidays] = await Promise.all([
    catalogPool.query("SELECT name FROM departments ORDER BY name"),
    catalogPool.query("SELECT name FROM designations ORDER BY name"),
    catalogPool.query("SELECT leave_type, annual_allowance FROM leave_policies ORDER BY leave_type"),
    catalogPool.query("SELECT holiday_date, name FROM holidays ORDER BY holiday_date"),
  ]);
  res.json({
    success: true,
    data: {
      departments: depts.rows.map((r) => (r as { name: string }).name),
      designations: desigs.rows.map((r) => (r as { name: string }).name),
      policies: policies.rows,
      holidays: holidays.rows,
    },
  });
});

adminRouter.post("/settings/departments", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const { name } = req.body as { name?: string };
  if (typeof name !== "string" || name.trim().length < 2) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Department name is required"));
    return;
  }
  await catalogPool.query("INSERT INTO departments (name) VALUES ($1) ON CONFLICT DO NOTHING", [name.trim()]);
  await writeAudit(catalogPool, { actor: req.userId ?? "", action: "settings.department_added", resource: `department:${name.trim()}` });
  res.status(201).json({ success: true, data: { name: name.trim() } });
});

adminRouter.post("/settings/designations", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const { name } = req.body as { name?: string };
  if (typeof name !== "string" || name.trim().length < 2) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Designation name is required"));
    return;
  }
  await catalogPool.query("INSERT INTO designations (name) VALUES ($1) ON CONFLICT DO NOTHING", [name.trim()]);
  await writeAudit(catalogPool, { actor: req.userId ?? "", action: "settings.designation_added", resource: `designation:${name.trim()}` });
  res.status(201).json({ success: true, data: { name: name.trim() } });
});
