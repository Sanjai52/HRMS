import { Router } from "express";
import {
  errorEnvelope,
  GateClosedError,
  workdayOf,
  isLate,
  ORG_TIMEZONE,
} from "@hrms/core";
import { fencedWrite } from "../fenced.js";

export const attendanceRouter = Router();
import { nextEventId } from "../ids.js";
import { LeaseExpiredError } from "@hrms/core";
import { ownedShardPools, partialMeta, type ShardPool } from "../db/shards.js";
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
    const row = await fencedWrite(target.pool, async (c) => {
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
    const row = await fencedWrite(target.pool, async (c) => {
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
  for (const { shard, pool } of ownedShardPools()) {
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
  res.json({ success: true, data: rows, meta: partialMeta(partial) });
});

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CORRECTION_STATUSES = new Set(["PRESENT", "LATE", "ABSENT", "HALF_DAY"]);

type StatusKey = "present" | "late" | "absent" | "halfDay";
type Counts = Record<StatusKey, number>;

function emptyCounts(): Counts {
  return { present: 0, late: 0, absent: 0, halfDay: 0 };
}

function statusKey(status: string): StatusKey | null {
  switch (status) {
    case "PRESENT":
      return "present";
    case "LATE":
      return "late";
    case "ABSENT":
      return "absent";
    case "HALF_DAY":
      return "halfDay";
    default:
      return null;
  }
}

function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

/** Current offset of the org timezone (e.g. "+05:30") for interpreting `HH:MM` stamps. */
function orgOffset(): string {
  const now = new Date();
  const utc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const org = new Date(now.toLocaleString("en-US", { timeZone: ORG_TIMEZONE }));
  const minutes = Math.round((org.getTime() - utc.getTime()) / 60000);
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * Normalize an optional check-in/out value: `HH:MM` is read as org-local time on
 * the corrected workday; anything else must parse as an instant. Returns
 * `undefined` when absent, `null` when invalid, an ISO string when valid.
 */
function normalizeStamp(value: unknown, workday: string): string | null | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (/^\d{2}:\d{2}$/.test(raw)) {
    const iso = `${workday}T${raw}:00${orgOffset()}`;
    return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
  }
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

attendanceRouter.get("/reports", requireAuth, requireRoles("HR", "ADMIN"), async (req, res) => {
  const month = workdayOf().slice(0, 7);
  const from = typeof req.query.from === "string" && req.query.from !== "" ? req.query.from : `${month}-01`;
  const to = typeof req.query.to === "string" && req.query.to !== "" ? req.query.to : lastDayOfMonth(month);
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "from and to must be YYYY-MM-DD dates with from <= to"));
    return;
  }
  const spanDays = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (spanDays > 366) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "The report range is capped at 366 days"));
    return;
  }
  const department = typeof req.query.department === "string" && req.query.department.trim() !== "" ? req.query.department.trim() : null;

  const owned = await ownedBuckets();
  const partial: string[] = [];
  const byDay = new Map<string, Counts>();
  const byDept = new Map<string, Counts>();
  for (const { shard, pool } of ownedShardPools()) {
    try {
      const r = await pool.query(
        "SELECT a.workday::text AS workday, e.department AS department, a.status AS status, count(*)::int AS n FROM attendance a JOIN employees e ON e.employee_id = a.employee_id WHERE a.workday >= $1::date AND a.workday <= $2::date AND a.bucket_id = ANY($3) AND ($4::text IS NULL OR e.department = $4) GROUP BY a.workday, e.department, a.status",
        [from, to, owned[shard] ?? [], department]
      );
      for (const row of r.rows as Array<{ workday: string; department: string; status: string; n: number }>) {
        const key = statusKey(row.status);
        if (!key) continue;
        const day = byDay.get(row.workday) ?? emptyCounts();
        day[key] += row.n;
        byDay.set(row.workday, day);
        const dept = byDept.get(row.department) ?? emptyCounts();
        dept[key] += row.n;
        byDept.set(row.department, dept);
      }
    } catch {
      partial.push(shard);
    }
  }

  const days: Array<{ workday: string } & Counts> = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    const workday = new Date(t).toISOString().slice(0, 10);
    days.push({ workday, ...(byDay.get(workday) ?? emptyCounts()) });
  }
  const departments = [...byDept.entries()]
    .map(([name, c]) => ({ department: name, ...c, total: c.present + c.late + c.absent + c.halfDay }))
    .sort((a, b) => a.department.localeCompare(b.department));
  const totals = days.reduce(
    (acc, d) => ({ present: acc.present + d.present, late: acc.late + d.late, absent: acc.absent + d.absent, halfDay: acc.halfDay + d.halfDay }),
    emptyCounts()
  );
  res.json({ success: true, data: { from, to, department, totals, days, departments }, meta: partialMeta(partial) });
});

attendanceRouter.post("/corrections", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const { employeeId, workday, status, checkIn, checkOut, reason } = req.body as {
    employeeId?: unknown;
    workday?: unknown;
    status?: unknown;
    checkIn?: unknown;
    checkOut?: unknown;
    reason?: unknown;
  };
  if (typeof employeeId !== "string" || employeeId === "") {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "employeeId is required"));
    return;
  }
  if (typeof workday !== "string" || !DAY_RE.test(workday)) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "workday must be YYYY-MM-DD"));
    return;
  }
  if (typeof status !== "string" || !CORRECTION_STATUSES.has(status)) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "status must be PRESENT, LATE, ABSENT or HALF_DAY"));
    return;
  }
  if (typeof reason !== "string" || reason.trim().length < 3) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "A reason of 3+ characters is required"));
    return;
  }
  const checkInIso = normalizeStamp(checkIn, workday);
  if (checkInIso === null) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "checkIn must be an ISO timestamp or HH:MM"));
    return;
  }
  const checkOutIso = normalizeStamp(checkOut, workday);
  if (checkOutIso === null) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "checkOut must be an ISO timestamp or HH:MM"));
    return;
  }

  const owned = await ownedBuckets();
  let found: { bucket: number; pool: ShardPool } | null = null;
  for (const { shard, pool } of ownedShardPools()) {
    const r = await pool.query("SELECT bucket_id FROM employees WHERE employee_id = $1 AND bucket_id = ANY($2)", [employeeId, owned[shard] ?? []]);
    if (r.rows.length > 0) {
      found = { bucket: (r.rows[0] as { bucket_id: number }).bucket_id, pool };
      break;
    }
  }
  if (!found) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Employee not found"));
    return;
  }
  const target = found;

  let attendanceId: string;
  try {
    attendanceId = nextEventId();
  } catch (e) {
    if (e instanceof LeaseExpiredError) {
      res.status(503).json(errorEnvelope("ID_LEASE_UNAVAILABLE", "ID generation is paused. Try again shortly."));
      return;
    }
    throw e;
  }

  try {
    const row = await fencedWrite(target.pool, async (c) => {
      const before = await c.query("SELECT status, check_in, check_out FROM attendance WHERE employee_id = $1 AND workday = $2::date", [employeeId, workday]);
      const upsert = await c.query(
        "INSERT INTO attendance (attendance_id, employee_id, bucket_id, workday, check_in, check_out, status) VALUES ($1,$2,$3,$4::date,$5,$6,$7) ON CONFLICT (employee_id, workday) DO UPDATE SET status = EXCLUDED.status, check_in = COALESCE(EXCLUDED.check_in, attendance.check_in), check_out = COALESCE(EXCLUDED.check_out, attendance.check_out) RETURNING attendance_id, employee_id, workday::text AS workday, check_in, check_out, status",
        [attendanceId, employeeId, target.bucket, workday, checkInIso ?? null, checkOutIso ?? null, status]
      );
      await c.query("INSERT INTO outbox_events (event_id, employee_id, bucket_id, type, payload, version) VALUES ($1,$2,$3,'AUDIT',$4,1)", [
        `${attendanceId}-audit`,
        employeeId,
        target.bucket,
        JSON.stringify({
          actor: req.userId ?? "",
          action: "attendance.corrected",
          resource: `attendance:${employeeId}:${workday}`,
          workday,
          status,
          reason: reason.trim().slice(0, 500),
          previous: before.rows[0] ?? null,
        }),
      ]);
      return upsert.rows[0];
    });
    res.json({ success: true, data: row });
  } catch (e) {
    if (e instanceof GateClosedError) {
      res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
      return;
    }
    throw e;
  }
});
