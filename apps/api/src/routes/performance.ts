import { Router } from "express";
import {
  errorEnvelope,
  stableEmployeeBucket,
  GateClosedError,
} from "@hrms/core";
import { fencedWrite } from "../fenced.js";
import { nextEventId } from "../ids.js";
import { LeaseExpiredError } from "@hrms/core";
import { catalogPool } from "../db/pools.js";
import { ownedShardPools, partialMeta, type ShardPool } from "../db/shards.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";
import { selfEmployeeId, shardFor, ownedBuckets } from "../directory/self.js";
import { writeAudit } from "../audit/audit.js";
import { assertCatalogOpen, CatalogGateError, gateError } from "../catalog-gate.js";

export const performanceRouter = Router();

function leaseId(res: import("express").Response): string | null {
  try {
    return nextEventId();
  } catch (e) {
    if (e instanceof LeaseExpiredError) {
      res.status(503).json(errorEnvelope("ID_LEASE_UNAVAILABLE", "ID generation is paused. Try again shortly."));
      return null;
    }
    throw e;
  }
}

performanceRouter.get("/cycles", requireAuth, async (_req, res) => {
  const rows = await catalogPool.query("SELECT * FROM review_cycles ORDER BY start_date DESC");
  res.json({ success: true, data: rows.rows });
});

performanceRouter.post("/cycles", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const { name, start, end } = req.body as { name?: string; start?: string; end?: string };
  if (typeof name !== "string" || name.trim().length < 3 || !start || !end || start > end) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Name and a valid start/end date are required"));
    return;
  }
  const id = leaseId(res);
  if (!id) return;
  const client = await catalogPool.connect();
  try {
    await client.query("BEGIN");
    await assertCatalogOpen(client);
    await client.query("INSERT INTO review_cycles (cycle_id, name, start_date, end_date, status, created_by) VALUES ($1,$2,$3,$4,'ACTIVE',$5)", [id, name.trim(), start, end, req.userId ?? ""]);
    await writeAudit({ query: client.query.bind(client) }, { actor: req.userId ?? "", action: "perf.cycle_created", resource: `cycle:${id}`, metadata: { name } });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    if (e instanceof CatalogGateError) {
      gateError(res);
      return;
    }
    throw e;
  } finally {
    client.release();
  }
  res.status(201).json({ success: true, data: { cycleId: id } });
});

performanceRouter.post("/cycles/:id/close", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const client = await catalogPool.connect();
  try {
    await client.query("BEGIN");
    await assertCatalogOpen(client);
    const r = await client.query("UPDATE review_cycles SET status = 'CLOSED' WHERE cycle_id = $1 AND status = 'ACTIVE' RETURNING cycle_id", [req.params.id]);
    if (r.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json(errorEnvelope("NOT_FOUND", "Active cycle not found"));
      return;
    }
    await writeAudit({ query: client.query.bind(client) }, { actor: req.userId ?? "", action: "perf.cycle_closed", resource: `cycle:${req.params.id}` });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    if (e instanceof CatalogGateError) {
      gateError(res);
      return;
    }
    throw e;
  } finally {
    client.release();
  }
  res.json({ success: true, data: { cycleId: req.params.id } });
});

async function canManage(req: AuthedRequest, employeeId: string): Promise<boolean> {
  const roles = req.roles ?? [];
  if (roles.includes("HR") || roles.includes("ADMIN")) return true;
  if (!roles.includes("MANAGER")) return false;
  const me = await selfEmployeeId(req);
  if (!me) return false;
  const t = await shardFor(employeeId);
  if (!t) return false;
  const r = await t.pool.query("SELECT manager_id FROM employees WHERE employee_id = $1", [employeeId]);
  return (r.rows[0]?.manager_id as string | null) === me;
}

performanceRouter.get("/goals", requireAuth, async (req: AuthedRequest, res) => {
  const roles = req.roles ?? [];
  const cycleId = typeof req.query.cycleId === "string" ? req.query.cycleId : null;
  const target = typeof req.query.employeeId === "string" ? req.query.employeeId : await selfEmployeeId(req);
  if (!target) {
    res.json({ success: true, data: [] });
    return;
  }
  const me = await selfEmployeeId(req);
  if (target !== me && !(await canManage(req, target)) && !roles.includes("HR") && !roles.includes("ADMIN")) {
    res.status(403).json(errorEnvelope("FORBIDDEN", "You cannot view these goals"));
    return;
  }
  const t = await shardFor(target);
  if (!t) {
    res.status(500).json(errorEnvelope("ROUTING_ERROR", "No shard owns this record"));
    return;
  }
  const rows = await t.pool.query(
    "SELECT * FROM goals WHERE employee_id = $1 AND ($2::text IS NULL OR cycle_id = $2) ORDER BY created_at DESC",
    [target, cycleId]
  );
  res.json({ success: true, data: rows.rows });
});

performanceRouter.post("/goals", requireAuth, requireRoles("MANAGER", "HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const { employeeId, cycleId, title, target, description } = req.body as Record<string, unknown>;
  if (typeof employeeId !== "string" || typeof cycleId !== "string" || typeof title !== "string" || title.trim().length < 3) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Employee, cycle and a goal title are required"));
    return;
  }
  if (!(await canManage(req, employeeId))) {
    res.status(403).json(errorEnvelope("FORBIDDEN", "Only the manager or HR can set goals"));
    return;
  }
  const cycle = await catalogPool.query("SELECT status FROM review_cycles WHERE cycle_id = $1", [cycleId]);
  if (cycle.rows.length === 0 || (cycle.rows[0] as { status: string }).status !== "ACTIVE") {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Goals need an active review cycle"));
    return;
  }
  const id = leaseId(res);
  if (!id) return;
  const t = await shardFor(employeeId);
  if (!t) {
    res.status(500).json(errorEnvelope("ROUTING_ERROR", "No shard owns this record"));
    return;
  }
  const bucket = stableEmployeeBucket(employeeId);
  try {
    await fencedWrite(t.pool, async (c) => {
      await c.query(
        "INSERT INTO goals (goal_id, employee_id, bucket_id, cycle_id, title, description, target) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [id, employeeId, bucket, cycleId, title.trim(), typeof description === "string" ? description.slice(0, 1000) : "", typeof target === "string" ? target.slice(0, 500) : ""]
      );
    });
  } catch (e) {
    if (e instanceof GateClosedError) {
      res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
      return;
    }
    throw e;
  }
  res.status(201).json({ success: true, data: { goalId: id } });
});

performanceRouter.patch("/goals/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { progress, status } = req.body as { progress?: number; status?: string };
  if (progress !== undefined && (!Number.isInteger(progress) || progress < 0 || progress > 100)) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Progress must be 0–100"));
    return;
  }
  if (status !== undefined && !["ACTIVE", "COMPLETED", "CANCELLED"].includes(status)) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Invalid goal status"));
    return;
  }
  const owned = await ownedBuckets();
  let found: { pool: ShardPool; employeeId: string } | null = null;
  for (const { shard, pool } of ownedShardPools()) {
    const r = await pool.query("SELECT employee_id FROM goals WHERE goal_id = $1 AND bucket_id = ANY($2)", [req.params.id, owned[shard] ?? []]);
    if (r.rows.length > 0) {
      found = { pool, employeeId: (r.rows[0] as { employee_id: string }).employee_id };
      break;
    }
  }
  if (!found) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Goal not found"));
    return;
  }
  const me = await selfEmployeeId(req);
  if (found.employeeId !== me && !(await canManage(req, found.employeeId))) {
    res.status(403).json(errorEnvelope("FORBIDDEN", "You cannot update this goal"));
    return;
  }
  try {
    await fencedWrite(found.pool, async (c) => {
      await c.query("UPDATE goals SET progress = COALESCE($2, progress), status = COALESCE($3, status), updated_at = now() WHERE goal_id = $1", [
        req.params.id,
        progress ?? null,
        status ?? null,
      ]);
    });
  } catch (e) {
    if (e instanceof GateClosedError) {
      res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
      return;
    }
    throw e;
  }
  res.json({ success: true, data: null });
});

performanceRouter.post("/reviews", requireAuth, requireRoles("MANAGER", "HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const { employeeId, cycleId, rating, feedback, strengths, improvements } = req.body as Record<string, unknown>;
  if (typeof employeeId !== "string" || typeof cycleId !== "string") {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Employee and cycle are required"));
    return;
  }
  if (rating !== undefined && rating !== null && (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5)) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Rating must be 1–5"));
    return;
  }
  const me = await selfEmployeeId(req);
  if (me === employeeId) {
    res.status(403).json(errorEnvelope("SELF_REVIEW", "You cannot review yourself"));
    return;
  }
  if (!(await canManage(req, employeeId))) {
    res.status(403).json(errorEnvelope("FORBIDDEN", "Only the manager or HR can review"));
    return;
  }
  const id = leaseId(res);
  if (!id) return;
  const t = await shardFor(employeeId);
  if (!t) {
    res.status(500).json(errorEnvelope("ROUTING_ERROR", "No shard owns this record"));
    return;
  }
  const bucket = stableEmployeeBucket(employeeId);
  try {
    await fencedWrite(t.pool, async (c) => {
      await c.query(
        "INSERT INTO reviews (review_id, employee_id, bucket_id, cycle_id, reviewer_id, rating, feedback, strengths, improvements) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [id, employeeId, bucket, cycleId, me ?? "", (rating as number) ?? null, str(feedback), str(strengths), str(improvements)]
      );
    });
  } catch (e) {
    if (e instanceof GateClosedError) {
      res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
      return;
    }
    throw e;
  }
  res.status(201).json({ success: true, data: { reviewId: id } });

  function str(v: unknown): string {
    return typeof v === "string" ? v.slice(0, 2000) : "";
  }
});

performanceRouter.post("/reviews/:id/submit", requireAuth, requireRoles("MANAGER", "HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const owned = await ownedBuckets();
  for (const { shard, pool } of ownedShardPools()) {
    try {
      const r = await fencedWrite(pool, async (c) => {
        return c.query("UPDATE reviews SET status = 'SUBMITTED', submitted_at = now() WHERE review_id = $1 AND status = 'DRAFT' AND bucket_id = ANY($2) RETURNING review_id", [req.params.id, owned[shard] ?? []]);
      });
      if (r.rows.length > 0) {
        res.json({ success: true, data: { reviewId: req.params.id } });
        return;
      }
    } catch (e) {
      if (e instanceof GateClosedError) {
        res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
        return;
      }
      throw e;
    }
  }
  res.status(404).json(errorEnvelope("NOT_FOUND", "Draft review not found"));
});

performanceRouter.post("/reviews/:id/release", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const owned = await ownedBuckets();
  for (const { shard, pool } of ownedShardPools()) {
    try {
      const out = await fencedWrite(pool, async (c) => {
        const r = await c.query("SELECT employee_id, bucket_id FROM reviews WHERE review_id = $1 AND status = 'SUBMITTED' AND bucket_id = ANY($2)", [req.params.id, owned[shard] ?? []]);
        if (r.rows.length === 0) return null;
        await c.query("UPDATE reviews SET status = 'RELEASED' WHERE review_id = $1", [req.params.id]);
        const eventId = leaseId(res);
        if (!eventId) throw new Error("LEASE");
        await c.query("INSERT INTO outbox_events (event_id, employee_id, bucket_id, type, payload, version) VALUES ($1,$2,$3,'REVIEW_RELEASED',$4,1)", [
          eventId,
          (r.rows[0] as { employee_id: string }).employee_id,
          (r.rows[0] as { bucket_id: number }).bucket_id,
          JSON.stringify({ reviewId: req.params.id }),
        ]);
        return true;
      });
      if (out) {
        res.json({ success: true, data: { reviewId: req.params.id } });
        return;
      }
    } catch (e) {
      if (e instanceof GateClosedError) {
        res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
        return;
      }
      if ((e as Error).message === "LEASE") return;
      throw e;
    }
  }
  res.status(404).json(errorEnvelope("NOT_FOUND", "Submitted review not found"));
});

performanceRouter.get("/reviews/me", requireAuth, async (req: AuthedRequest, res) => {
  const me = await selfEmployeeId(req);
  if (!me) {
    res.json({ success: true, data: [] });
    return;
  }
  const t = await shardFor(me);
  if (!t) {
    res.status(500).json(errorEnvelope("ROUTING_ERROR", "No shard owns this record"));
    return;
  }
  const cycleId = typeof req.query.cycleId === "string" ? req.query.cycleId : null;
  const rows = await t.pool.query(
    "SELECT review_id, cycle_id, rating, feedback, strengths, improvements, submitted_at FROM reviews WHERE employee_id = $1 AND status = 'RELEASED' AND ($2::text IS NULL OR cycle_id = $2) ORDER BY submitted_at DESC",
    [me, cycleId]
  );
  res.json({ success: true, data: rows.rows });
});

performanceRouter.get("/team", requireAuth, requireRoles("MANAGER", "HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const cycleId = typeof req.query.cycleId === "string" ? req.query.cycleId : null;
  const owned = await ownedBuckets();
  const out: unknown[] = [];
  const unavailable: string[] = [];
  const me = await selfEmployeeId(req);
  for (const { shard, pool } of ownedShardPools()) {
    try {
      const r = await pool.query(
        "SELECT r.*, e.name AS employee_name FROM reviews r JOIN employees e ON e.employee_id = r.employee_id WHERE r.bucket_id = ANY($3) AND ($1::text IS NULL OR r.cycle_id = $1) AND ($2::text IS NULL OR e.manager_id = $2) ORDER BY r.submitted_at DESC NULLS LAST LIMIT 50",
        [cycleId, (req.roles ?? []).some((x) => x === "HR" || x === "ADMIN") ? null : me, owned[shard] ?? []]
      );
      out.push(...r.rows);
    } catch {
      unavailable.push(shard);
    }
  }
  res.json({ success: true, data: out, meta: partialMeta(unavailable) });
});

performanceRouter.get("/summary", requireAuth, requireRoles("HR", "ADMIN"), async (req, res) => {
  const cycleId = typeof req.query.cycleId === "string" ? req.query.cycleId : null;
  const owned = await ownedBuckets();
  let reviews = 0;
  let released = 0;
  const dist: Record<string, number> = {};
  const unavailable: string[] = [];
  for (const { shard, pool } of ownedShardPools()) {
    try {
      const r = await pool.query("SELECT status, rating FROM reviews WHERE bucket_id = ANY($2) AND ($1::text IS NULL OR cycle_id = $1)", [cycleId, owned[shard] ?? []]);
      for (const row of r.rows as Array<{ status: string; rating: number | null }>) {
        reviews += 1;
        if (row.status === "RELEASED") released += 1;
        if (row.rating) dist[String(row.rating)] = (dist[String(row.rating)] ?? 0) + 1;
      }
    } catch {
      unavailable.push(shard);
    }
  }
  res.json({ success: true, data: { reviews, released, completion: reviews > 0 ? Math.round((released / reviews) * 100) : 0, distribution: dist }, meta: partialMeta(unavailable) });
});
