import { Router } from "express";
import {
  errorEnvelope,
  withFencedWrite,
  GateClosedError,
  workdayOf,
  isLate,
} from "@hrms/core";

export const attendanceRouter = Router();
import { nextEventId } from "../ids.js";
import { LeaseExpiredError } from "@hrms/core";
import { catalogPool, shardPools } from "../db/pools.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";
import { selfEmployeeId, shardFor, ownedBuckets } from "../directory/self.js";

attendanceRouter.post("/check-in", requireAuth, async (req: AuthedRequest, res) => {
  const employeeId = await selfEmployeeId(req);
  if (!employeeId) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "No employee record for this account yet"));
    return;
  }
  const target = await shardFor(employeeId);
  if (!target) {
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
  const now = new Date();
  const day = workdayOf(now);
  try {
    const row = await withFencedWrite(target.pool, async (c) => {
      const existing = await c.query("SELECT attendance_id, check_in, check_out, status FROM attendance WHERE employee_id = $1 AND workday = $2", [employeeId, day]);
      if (existing.rows.length > 0) return { ...(existing.rows[0] as object), duplicate: true };
      const status = isLate(now) ? "LATE" : "PRESENT";
      const r = await c.query(
        "INSERT INTO attendance (attendance_id, employee_id, bucket_id, workday, check_in, status) VALUES ($1, $2, (SELECT bucket_id FROM employees WHERE employee_id = $2), $3, $4, $5) RETURNING attendance_id, check_in, check_out, status",
        [eventId, employeeId, day, now.toISOString(), status]
      );
      return { ...(r.rows[0] as object), duplicate: false };
    });
    res.status(201).json({ success: true, data: row });
  } catch (e) {
    if (e instanceof GateClosedError) {
      res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
      return;
    }
    throw e;
  }
});

attendanceRouter.post("/check-out", requireAuth, async (req: AuthedRequest, res) => {
  const employeeId = await selfEmployeeId(req);
  if (!employeeId) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "No employee record for this account yet"));
    return;
  }
  const target = await shardFor(employeeId);
  if (!target) {
    res.status(500).json(errorEnvelope("ROUTING_ERROR", "No shard owns this record"));
    return;
  }
  try {
    const row = await withFencedWrite(target.pool, async (c) => {
      const r = await c.query("SELECT attendance_id, check_in, check_out FROM attendance WHERE employee_id = $1 AND workday = $2", [employeeId, workdayOf(new Date())]);
      if (r.rows.length === 0 || !(r.rows[0] as { check_in: string }).check_in) {
        return null;
      }
      if ((r.rows[0] as { check_out: string }).check_out) return { ...(r.rows[0] as object), duplicate: true };
      const u = await c.query("UPDATE attendance SET check_out = $3 WHERE attendance_id = $1 AND employee_id = $2 RETURNING attendance_id, check_in, check_out, status", [
        (r.rows[0] as { attendance_id: string }).attendance_id,
        employeeId,
        new Date().toISOString(),
      ]);
      return { ...(u.rows[0] as object), duplicate: false };
    });
    if (!row) {
      res.status(409).json(errorEnvelope("NO_OPEN_CHECKIN", "Check in first before checking out"));
      return;
    }
    res.json({ success: true, data: row });
  } catch (e) {
    if (e instanceof GateClosedError) {
      res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
      return;
    }
    throw e;
  }
});

attendanceRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const employeeId = await selfEmployeeId(req);
  if (!employeeId) {
    res.json({ success: true, data: { today: null, history: [], summary: { present: 0, late: 0 } } });
    return;
  }
  const target = await shardFor(employeeId);
  if (!target) {
    res.status(500).json(errorEnvelope("ROUTING_ERROR", "No shard owns this record"));
    return;
  }
  const month = typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : workdayOf().slice(0, 7);
  const history = await target.pool.query(
    "SELECT workday, check_in, check_out, status FROM attendance WHERE employee_id = $1 AND workday >= ($2 || '-01')::date AND workday < (($2 || '-01')::date + interval '1 month') ORDER BY workday DESC",
    [employeeId, month]
  );
  const today = await target.pool.query("SELECT workday, check_in, check_out, status FROM attendance WHERE employee_id = $1 AND workday = $2::date", [employeeId, workdayOf()]);
  const rows = history.rows as Array<{ status: string }>;
  res.json({
    success: true,
    data: {
      today: today.rows[0] ?? null,
      history: history.rows,
      summary: { present: rows.filter((r) => r.status === "PRESENT").length, late: rows.filter((r) => r.status === "LATE").length },
    },
  });
});

attendanceRouter.get("/day", requireAuth, requireRoles("HR", "ADMIN"), async (req, res) => {
  const date = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : workdayOf();
  const owned = await ownedBuckets();
  const rows: unknown[] = [];
  const partial: string[] = [];
  for (const [shard, pool] of Object.entries(shardPools)) {
    if (shard === "shard-4") continue;
    try {
      const r = await pool.query(
        "SELECT a.employee_id, a.workday, a.check_in, a.check_out, a.status, e.name, e.department FROM attendance a JOIN employees e ON e.employee_id = a.employee_id WHERE a.workday = $1::date AND a.bucket_id = ANY($2) ORDER BY e.name",
        [date, owned[shard] ?? []]
      );
      rows.push(...r.rows);
    } catch {
      partial.push(shard);
    }
  }
  res.json({ success: true, data: rows, meta: partial.length > 0 ? { partial: true, unavailable: partial } : { partial: false } });
});
