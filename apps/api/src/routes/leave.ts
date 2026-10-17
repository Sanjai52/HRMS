import { Router } from "express";
import {
  errorEnvelope,
  countWorkdays,
  withFencedWrite,
  GateClosedError,
  loadActiveMap,
  resolveShard,
} from "@hrms/core";
import { nextEventId } from "../ids.js";
import { LeaseExpiredError } from "@hrms/core";
import { catalogPool } from "../db/pools.js";
import { ownedShardPools, type ShardPool } from "../db/shards.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";
import { selfEmployeeId, shardFor, ownedBuckets } from "../directory/self.js";

export const leaveRouter = Router();

function isoDay(v: string | Date): string {
  return typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10);
}

type LeaveRow = {
  request_id: string;
  employee_id: string;
  bucket_id: number;
  leave_type: string;
  start_date: string | Date;
  end_date: string | Date;
  workdays: number;
  reason: string;
  status: string;
  version: number;
  decided_by: string;
};

async function holidays(): Promise<Set<string>> {
  const r = await catalogPool.query("SELECT holiday_date FROM holidays");
  return new Set(r.rows.map((row) => (row.holiday_date as Date).toISOString().slice(0, 10)));
}

async function allowance(type: string): Promise<number | null> {
  const r = await catalogPool.query("SELECT annual_allowance FROM leave_policies WHERE leave_type = $1", [type]);
  return r.rows.length > 0 ? (r.rows[0].annual_allowance as number) : null;
}

leaveRouter.get("/balances", requireAuth, async (req: AuthedRequest, res) => {
  const roles = req.roles ?? [];
  const target =
    typeof req.query.employeeId === "string" && (roles.includes("HR") || roles.includes("ADMIN"))
      ? req.query.employeeId
      : await selfEmployeeId(req);
  if (!target) {
    res.json({ success: true, data: [] });
    return;
  }
  const t = await shardFor(target);
  if (!t) {
    res.status(500).json(errorEnvelope("ROUTING_ERROR", "No shard owns this record"));
    return;
  }
  const year = Number(req.query.year ?? new Date().getFullYear());
  const rows = await t.pool.query("SELECT leave_type, year, total_days, used_days FROM leave_balances WHERE employee_id = $1 AND year = $2", [target, year]);
  res.json({ success: true, data: rows.rows });
});

leaveRouter.post("/requests", requireAuth, async (req: AuthedRequest, res) => {
  const employeeId = await selfEmployeeId(req);
  if (!employeeId) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "No employee record for this account yet"));
    return;
  }
  const { type, start, end, reason } = req.body as { type?: string; start?: string; end?: string; reason?: string };
  if (!type || !start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Leave type and a valid start/end date are required"));
    return;
  }
  if (start.slice(0, 4) !== end.slice(0, 4)) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Requests spanning two years are not supported in this version"));
    return;
  }
  const total = await allowance(type);
  if (total === null) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Unknown leave type"));
    return;
  }
  const days = countWorkdays(start, end, await holidays());
  if (days <= 0) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "This range has no working days"));
    return;
  }
  const t = await shardFor(employeeId);
  if (!t) {
    res.status(500).json(errorEnvelope("ROUTING_ERROR", "No shard owns this record"));
    return;
  }
  let eventId: string;
  try {
    eventId = nextEventId();
  } catch (e) {
    if (e instanceof LeaseExpiredError) {
      res.status(503).json(errorEnvelope("ID_LEASE_UNAVAILABLE", "ID generation is paused. Try again shortly."));
      return;
    }
    throw e;
  }
  const year = Number(start.slice(0, 4));
  try {
    const request = await withFencedWrite(t.pool, async (c) => {
      await c.query(
        "INSERT INTO leave_balances (employee_id, bucket_id, leave_type, year, total_days) VALUES ($1, (SELECT bucket_id FROM employees WHERE employee_id = $1), $2, $3, $4) ON CONFLICT DO NOTHING",
        [employeeId, type, year, total]
      );
      const clash = await c.query(
        "SELECT request_id FROM leave_requests WHERE employee_id = $1 AND status IN ('PENDING_MANAGER','PENDING_HR','APPROVED') AND start_date <= $3 AND end_date >= $2 LIMIT 1",
        [employeeId, start, end]
      );
      if (clash.rows.length > 0) return { conflict: true as const };
      const bal = await c.query("SELECT total_days, used_days FROM leave_balances WHERE employee_id = $1 AND leave_type = $2 AND year = $3", [employeeId, type, year]);
      const pending = await c.query(
        "SELECT COALESCE(SUM(workdays), 0) AS s FROM leave_requests WHERE employee_id = $1 AND leave_type = $2 AND status IN ('PENDING_MANAGER','PENDING_HR') AND start_date >= $3 AND start_date < $4",
        [employeeId, type, `${year}-01-01`, `${year + 1}-01-01`]
      );
      const used = (bal.rows[0]?.used_days as number) ?? 0;
      const reserved = Number((pending.rows[0] as { s: string }).s);
      if (used + reserved + days > total) return { balance: true as const };
      const me = await c.query("SELECT manager_id FROM employees WHERE employee_id = $1", [employeeId]);
      const managerId = me.rows[0]?.manager_id as string | null;
      let status = "PENDING_HR";
      if (managerId) {
        const mgr = await catalogPool.query("SELECT status FROM employee_directory WHERE employee_id = $1", [managerId]);
        if (mgr.rows.length > 0 && (mgr.rows[0] as { status: string }).status === "ACTIVE") status = "PENDING_MANAGER";
      }
      const r = await c.query(
        "INSERT INTO leave_requests (request_id, employee_id, bucket_id, leave_type, start_date, end_date, workdays, reason, status) VALUES ($1, $2, (SELECT bucket_id FROM employees WHERE employee_id = $2), $3, $4, $5, $6, $7, $8) RETURNING *",
        [eventId, employeeId, type, start, end, days, (reason ?? "").slice(0, 500), status]
      );
      return { row: r.rows[0] as LeaveRow };
    });
    if ("conflict" in request) {
      res.status(409).json(errorEnvelope("OVERLAP", "This overlaps an existing leave request"));
      return;
    }
    if ("balance" in request) {
      res.status(409).json(errorEnvelope("INSUFFICIENT_BALANCE", "Not enough leave balance for this request"));
      return;
    }
    res.status(201).json({ success: true, data: request.row });
  } catch (e) {
    if (e instanceof GateClosedError) {
      res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
      return;
    }
    throw e;
  }
});

leaveRouter.get("/requests", requireAuth, async (req: AuthedRequest, res) => {
  const roles = req.roles ?? [];
  const mineOnly = req.query.mine === "true" || (!roles.includes("HR") && !roles.includes("ADMIN") && !roles.includes("MANAGER"));
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const owned = await ownedBuckets();
  const out: unknown[] = [];
  const partial: string[] = [];
  for (const { shard, pool } of ownedShardPools()) {
    try {
      if (mineOnly) {
        const me = await selfEmployeeId(req);
        if (!me) break;
        const r = await pool.query(
          "SELECT * FROM leave_requests WHERE employee_id = $1 AND bucket_id = ANY($3) AND ($2::text IS NULL OR status = $2) ORDER BY created_at DESC LIMIT 50",
          [me, status, owned[shard] ?? []]
        );
        out.push(...r.rows);
      } else if (roles.includes("MANAGER") && !roles.includes("HR") && !roles.includes("ADMIN")) {
        const me = await selfEmployeeId(req);
        const r = await pool.query(
          "SELECT lr.* FROM leave_requests lr JOIN employees e ON e.employee_id = lr.employee_id WHERE e.manager_id = $1 AND lr.bucket_id = ANY($3) AND ($2::text IS NULL OR lr.status = $2) ORDER BY lr.created_at DESC LIMIT 50",
          [me, status, owned[shard] ?? []]
        );
        out.push(...r.rows);
      } else {
        const r = await pool.query(
          "SELECT lr.*, e.name AS requester_name FROM leave_requests lr JOIN employees e ON e.employee_id = lr.employee_id WHERE lr.bucket_id = ANY($2) AND ($1::text IS NULL OR lr.status = $1) ORDER BY lr.created_at DESC LIMIT 50",
          [status, owned[shard] ?? []]
        );
        out.push(...r.rows);
      }
    } catch {
      partial.push(shard);
    }
  }
  res.json({ success: true, data: out, meta: partial.length > 0 ? { partial: true, unavailable: partial } : { partial: false } });
});

async function decide(
  req: AuthedRequest,
  res: import("express").Response,
  to: "APPROVED" | "REJECTED",
  opts?: { override?: boolean }
): Promise<void> {
  const { version, reason } = req.body as { version?: number; reason?: string };
  if (typeof version !== "number") {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Current version is required"));
    return;
  }
  const roles = req.roles ?? [];
  const me = await selfEmployeeId(req);
  const owned = await ownedBuckets();
  let found: { shard: string; pool: ShardPool; row: LeaveRow } | null = null;
  for (const { shard, pool } of ownedShardPools()) {
    const r = await pool.query("SELECT * FROM leave_requests WHERE request_id = $1 AND bucket_id = ANY($2)", [req.params.id, owned[shard] ?? []]);
    if (r.rows.length > 0) {
      found = { shard, pool, row: r.rows[0] as LeaveRow };
      break;
    }
  }
  if (!found) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Leave request not found"));
    return;
  }
  const { row } = found;
  if (row.version !== version) {
    res.status(409).json(errorEnvelope("VERSION_CONFLICT", "This request changed. Reload and try again."));
    return;
  }
  if (row.employee_id === me) {
    res.status(403).json(errorEnvelope("SELF_APPROVAL", "You cannot decide your own leave request"));
    return;
  }
  const isHr = roles.includes("HR") || roles.includes("ADMIN");
  let permitted = false;
  if (opts?.override) {
    permitted = isHr && row.status === "REJECTED" && typeof reason === "string" && reason.trim().length > 0;
    if (!permitted) {
      res.status(403).json(errorEnvelope("FORBIDDEN", "Override needs HR authority, a rejected request and a written reason"));
      return;
    }
  } else if (row.status === "PENDING_MANAGER") {
    if (isHr) {
      permitted = true;
    } else if (roles.includes("MANAGER")) {
      const emp = await found.pool.query("SELECT manager_id FROM employees WHERE employee_id = $1", [row.employee_id]);
      permitted = (emp.rows[0]?.manager_id as string | null) === me;
    }
  } else if (row.status === "PENDING_HR") {
    permitted = isHr;
    if (permitted && row.employee_id === me && !(await hrPeerExists(req))) {
      res.status(409).json(errorEnvelope("NO_ELIGIBLE_APPROVER", "Another HR member or Admin must decide this."));
      return;
    }
  }
  if (!permitted) {
    res.status(403).json(errorEnvelope("FORBIDDEN", "You cannot decide this request"));
    return;
  }
  let eventId: string;
  try {
    eventId = nextEventId();
  } catch (e) {
    if (e instanceof LeaseExpiredError) {
      res.status(503).json(errorEnvelope("ID_LEASE_UNAVAILABLE", "ID generation is paused. Try again shortly."));
      return;
    }
    throw e;
  }
  try {
    const next = to === "APPROVED" && row.status === "PENDING_MANAGER" && !isHr ? "PENDING_HR" : to;
    await withFencedWrite(found.pool, async (c) => {
      const current = await c.query("SELECT status, version FROM leave_requests WHERE request_id = $1", [req.params.id]);
      if (current.rows.length === 0 || (current.rows[0] as LeaveRow).version !== version) throw new Error("VERSION_CONFLICT");
      await c.query("UPDATE leave_requests SET status = $2, version = version + 1, decided_by = $3, decided_at = now() WHERE request_id = $1", [
        req.params.id,
        next,
        req.userId ?? "",
      ]);
      if (next === "APPROVED") {
        await c.query("UPDATE leave_balances SET used_days = used_days + $3 WHERE employee_id = $1 AND leave_type = $2 AND year = $4", [
          row.employee_id,
          row.leave_type,
          row.workdays,
          Number(isoDay(row.start_date).slice(0, 4)),
        ]);
      }
      await c.query("INSERT INTO outbox_events (event_id, employee_id, bucket_id, type, payload, version) VALUES ($1,$2,$3,'LEAVE_DECIDED',$4,$5)", [
        eventId,
        row.employee_id,
        row.bucket_id,
        JSON.stringify({ requestId: req.params.id, status: next, approver: req.userId ?? "", override: opts?.override === true, reason: (reason ?? "").slice(0, 500) }),
        version + 1,
      ]);
      await c.query("INSERT INTO outbox_events (event_id, employee_id, bucket_id, type, payload, version) VALUES ($1,$2,$3,'AUDIT',$4,$5)", [
        `${eventId}-audit`,
        row.employee_id,
        row.bucket_id,
        JSON.stringify({ actor: req.userId ?? "", action: opts?.override ? "leave.override" : "leave.decided", resource: `leave:${req.params.id}` }),
        version + 1,
      ]);
    });
    res.json({ success: true, data: { requestId: req.params.id, status: next } });
  } catch (e) {
    if (e instanceof GateClosedError) {
      res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
      return;
    }
    if ((e as Error).message === "VERSION_CONFLICT") {
      res.status(409).json(errorEnvelope("VERSION_CONFLICT", "This request changed. Reload and try again."));
      return;
    }
    throw e;
  }

  async function hrPeerExists(r: AuthedRequest): Promise<boolean> {
    const others = await catalogPool.query(
      "SELECT user_id FROM users JOIN user_roles USING (user_id) WHERE role IN ('HR','ADMIN') AND user_id <> $1 LIMIT 1",
      [r.userId]
    );
    return others.rows.length > 0;
  }
}

leaveRouter.post("/requests/:id/approve", requireAuth, async (req: AuthedRequest, res) => {
  await decide(req, res, "APPROVED");
});

leaveRouter.post("/requests/:id/reject", requireAuth, async (req: AuthedRequest, res) => {
  await decide(req, res, "REJECTED");
});

leaveRouter.post("/requests/:id/override", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  await decide(req, res, "APPROVED", { override: true });
});

leaveRouter.post("/requests/:id/cancel", requireAuth, async (req: AuthedRequest, res) => {
  const me = await selfEmployeeId(req);
  const roles = req.roles ?? [];
  const owned = await ownedBuckets();
  let found: { pool: ShardPool; row: LeaveRow } | null = null;
  for (const { shard, pool } of ownedShardPools()) {
    const r = await pool.query("SELECT * FROM leave_requests WHERE request_id = $1 AND bucket_id = ANY($2)", [req.params.id, owned[shard] ?? []]);
    if (r.rows.length > 0) {
      found = { pool, row: r.rows[0] as LeaveRow };
      break;
    }
  }
  if (!found) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Leave request not found"));
    return;
  }
  const { row } = found;
  const isOwner = row.employee_id === me;
  const isHr = roles.includes("HR") || roles.includes("ADMIN");
  if (!isOwner && !isHr) {
    res.status(403).json(errorEnvelope("FORBIDDEN", "You cannot cancel this request"));
    return;
  }
  if (row.status === "APPROVED" && !isHr) {
    res.status(403).json(errorEnvelope("FORBIDDEN", "Only HR can cancel an approved request"));
    return;
  }
  if (row.status === "CANCELLED" || row.status === "REJECTED") {
    res.status(409).json(errorEnvelope("ALREADY_CLOSED", "This request is already closed"));
    return;
  }
  let eventId: string;
  try {
    eventId = nextEventId();
  } catch (e) {
    if (e instanceof LeaseExpiredError) {
      res.status(503).json(errorEnvelope("ID_LEASE_UNAVAILABLE", "ID generation is paused. Try again shortly."));
      return;
    }
    throw e;
  }
  const wasApproved = row.status === "APPROVED";
  try {
    await withFencedWrite(found.pool, async (c) => {
      await c.query("UPDATE leave_requests SET status = 'CANCELLED', version = version + 1 WHERE request_id = $1", [req.params.id]);
      if (wasApproved) {
        await c.query("UPDATE leave_balances SET used_days = GREATEST(0, used_days - $3) WHERE employee_id = $1 AND leave_type = $2 AND year = $4", [
          row.employee_id,
          row.leave_type,
          row.workdays,
          Number(isoDay(row.start_date).slice(0, 4)),
        ]);
      }
      await c.query("INSERT INTO outbox_events (event_id, employee_id, bucket_id, type, payload, version) VALUES ($1,$2,$3,'LEAVE_DECIDED',$4,$5)", [
        eventId,
        row.employee_id,
        row.bucket_id,
        JSON.stringify({ requestId: req.params.id, status: "CANCELLED", approver: req.userId ?? "" }),
        row.version + 1,
      ]);
    });
    res.json({ success: true, data: { requestId: req.params.id, status: "CANCELLED" } });
  } catch (e) {
    if (e instanceof GateClosedError) {
      res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
      return;
    }
    throw e;
  }
});

leaveRouter.get("/policies", requireAuth, requireRoles("HR", "ADMIN"), async (_req, res) => {
  const [policies, holidaysRows] = await Promise.all([
    catalogPool.query("SELECT leave_type, annual_allowance FROM leave_policies ORDER BY leave_type"),
    catalogPool.query("SELECT holiday_date, name FROM holidays ORDER BY holiday_date"),
  ]);
  res.json({ success: true, data: { policies: policies.rows, holidays: holidaysRows.rows } });
});
