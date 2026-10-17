import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  errorEnvelope,
  loadActiveMap,
  resolveShard,
  stableEmployeeBucket,
  GateClosedError,
} from "@hrms/core";
import { fencedWrite } from "../fenced.js";
import { catalogPool } from "../db/pools.js";
import { ownedShardPools, partialMeta, poolFor } from "../db/shards.js";
import { assertCatalogOpen, CatalogGateError, gateError } from "../catalog-gate.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";
import { searchLimit } from "../middleware/rate-limit.js";
import { destroyUserSessions } from "../auth/sessions.js";
import { nextEventId } from "../ids.js";
import { LeaseExpiredError } from "@hrms/core";
import { selfEmployeeId } from "../directory/self.js";

export const employeesRouter = Router();

function leaseError(res: import("express").Response): void {
  res.status(503).json(errorEnvelope("ID_LEASE_UNAVAILABLE", "ID generation is paused. Try again shortly."));
}

employeesRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const u = await catalogPool.query("SELECT email_norm FROM users WHERE user_id = $1", [req.userId]);
  if (u.rows.length === 0) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Account not found" } });
    return;
  }
  const d = await catalogPool.query(
    "SELECT employee_id, name, email, department, designation, status, version, updated_at FROM employee_directory WHERE email_norm = $1",
    [u.rows[0].email_norm]
  );
  res.json({ success: true, data: d.rows[0] ?? null });
});

employeesRouter.patch("/me", requireAuth, async (req: AuthedRequest, res) => {
  const { name, version } = req.body as { name?: string; version?: number };
  if (typeof name !== "string" || name.trim().length < 2 || typeof version !== "number") {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Name and current version are required"));
    return;
  }
  const u = await catalogPool.query("SELECT email_norm FROM users WHERE user_id = $1", [req.userId]);
  if (u.rows.length === 0) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Account not found"));
    return;
  }
  const d = await catalogPool.query("SELECT employee_id FROM employee_directory WHERE email_norm = $1", [u.rows[0].email_norm]);
  if (d.rows.length === 0) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "No employee record for this account yet"));
    return;
  }
  const employeeId = d.rows[0].employee_id as string;
  const { map } = await loadActiveMap(catalogPool);
  const pool = poolFor(resolveShard(employeeId, map));
  if (!pool) {
    res.status(500).json(errorEnvelope("ROUTING_ERROR", "No shard owns this record"));
    return;
  }
  let eventId: string;
  try {
    eventId = nextEventId();
  } catch (e) {
    if (e instanceof LeaseExpiredError) {
      leaseError(res);
      return;
    }
    throw e;
  }
  try {
    const updated = await fencedWrite(pool, async (c) => {
      const r = await c.query("UPDATE employees SET name = $2, version = version + 1, updated_at = now() WHERE employee_id = $1 AND version = $3 RETURNING employee_id, bucket_id, name, email, department, designation, version", [employeeId, name.trim(), version]);
      if (r.rows.length === 0) return null;
      const row = r.rows[0] as { employee_id: string; bucket_id: number; name: string; email: string; department: string; designation: string; version: number };
      await c.query("INSERT INTO outbox_events (event_id, employee_id, bucket_id, type, payload, version) VALUES ($1,$2,$3,'EMPLOYEE_UPDATED',$4,$5)", [
        eventId,
        row.employee_id,
        row.bucket_id,
        JSON.stringify({ name: row.name, email: row.email, department: row.department, designation: row.designation }),
        row.version,
      ]);
      await c.query("INSERT INTO outbox_events (event_id, employee_id, bucket_id, type, payload, version) VALUES ($1,$2,$3,'AUDIT',$4,$5)", [
        `${eventId}-audit`,
        row.employee_id,
        row.bucket_id,
        JSON.stringify({ actor: req.userId ?? "", action: "employee.profile_updated", resource: `employee:${row.employee_id}` }),
        row.version,
      ]);
      return row;
    });
    if (!updated) {
      res.status(409).json(errorEnvelope("VERSION_CONFLICT", "Your profile changed. Reload and try again."));
      return;
    }
    res.json({ success: true, data: updated });
  } catch (e) {
    if (e instanceof GateClosedError) {
      res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
      return;
    }
    throw e;
  }
});

employeesRouter.get("/", requireAuth, requireRoles("HR", "ADMIN", "MANAGER"), searchLimit, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const rows = q
    ? await catalogPool.query(
        "SELECT employee_id, name, email, department, designation, status, updated_at FROM employee_directory WHERE name ILIKE $1 OR email_norm LIKE $2 ORDER BY name LIMIT $3",
        [`%${q}%`, `%${q.toLowerCase()}%`, limit]
      )
    : await catalogPool.query(
        "SELECT employee_id, name, email, department, designation, status, updated_at FROM employee_directory ORDER BY name LIMIT $1",
        [limit]
      );
  res.json({ success: true, data: rows.rows });
});

employeesRouter.post("/onboard", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const { invitationId } = req.body as { invitationId?: string };
  if (!invitationId) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "invitationId is required"));
    return;
  }
  let eventId: string;
  try {
    eventId = nextEventId();
  } catch (e) {
    if (e instanceof LeaseExpiredError) {
      leaseError(res);
      return;
    }
    throw e;
  }
  const client = await catalogPool.connect();
  try {
    await client.query("BEGIN");
    await assertCatalogOpen(client);
    const inv = await client.query("SELECT * FROM invitations WHERE invitation_id = $1 FOR UPDATE", [invitationId]);
    if (inv.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json(errorEnvelope("NOT_FOUND", "Invitation not found"));
      return;
    }
    const row = inv.rows[0] as { email: string; email_norm: string; name: string; role: string; status: string };
    if (row.status !== "RESERVED") {
      await client.query("ROLLBACK");
      res.status(409).json(errorEnvelope("INVITATION_STATE", `Invitation is ${row.status}. The invitee must accept it first.`));
      return;
    }
    const { map } = await loadActiveMap({ query: client.query.bind(client) });
    const employeeId = randomUUID();
    const bucket = stableEmployeeBucket(employeeId);
    const shard = resolveShard(employeeId, map);
    const pool = poolFor(shard);
    if (!pool) throw new Error(`unknown-shard:${shard}`);
    const displayId = `EMP-${String(Date.now()).slice(-6)}`;
    try {
      await fencedWrite(pool, async (c) => {
        await c.query(
          "INSERT INTO employees (employee_id, bucket_id, display_id, email, name, department, designation, status) VALUES ($1,$2,$3,$4,$5,'','', 'ACTIVE')",
          [employeeId, bucket, displayId, row.email_norm, row.name || row.email]
        );
        await c.query(
          "INSERT INTO outbox_events (event_id, employee_id, bucket_id, type, payload, version) VALUES ($1,$2,$3,'EMPLOYEE_CREATED',$4,1)",
          [eventId, employeeId, bucket, JSON.stringify({ name: row.name || row.email, email: row.email_norm, department: "", designation: "" })]
        );
        await c.query(
          "INSERT INTO outbox_events (event_id, employee_id, bucket_id, type, payload, version) VALUES ($1,$2,$3,'AUDIT',$4,1)",
          [
            `${eventId}-audit`,
            employeeId,
            bucket,
            JSON.stringify({ actor: req.userId ?? "", action: "employee.onboarded", resource: `employee:${employeeId}`, email: row.email_norm, shard }),
          ]
        );
      });
    } catch (e) {
      if (e instanceof GateClosedError) {
        await client.query("ROLLBACK");
        res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
        return;
      }
      throw e;
    }
    await client.query("UPDATE invitations SET status = 'ACTIVE' WHERE invitation_id = $1", [invitationId]);
    await client.query("COMMIT");
    res.status(201).json({ success: true, data: { employeeId, bucket, shard } });
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
});

employeesRouter.get("/team", requireAuth, requireRoles("MANAGER", "HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const roles = req.roles ?? [];
  const { map } = await loadActiveMap(catalogPool);
  const owned: Record<string, number[]> = {};
  for (const [bucket, shard] of map) {
    (owned[shard] ??= []).push(bucket);
  }
  const out: unknown[] = [];
  const unavailable: string[] = [];
  if (roles.includes("MANAGER") && !roles.includes("HR") && !roles.includes("ADMIN")) {
    const me = await catalogPool.query("SELECT email_norm FROM users WHERE user_id = $1", [req.userId]);
    if (me.rows.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }
    const selfRow = await catalogPool.query("SELECT employee_id FROM employee_directory WHERE email_norm = $1", [me.rows[0].email_norm]);
    const myId = selfRow.rows[0]?.employee_id as string | undefined;
    if (!myId) {
      res.json({ success: true, data: [] });
      return;
    }
    for (const { shard, pool } of ownedShardPools()) {
      try {
        const r = await pool.query(
          "SELECT employee_id, name, email, department, designation, status FROM employees WHERE manager_id = $1 AND bucket_id = ANY($2) ORDER BY name",
          [myId, owned[shard] ?? []]
        );
        out.push(...r.rows);
      } catch {
        unavailable.push(shard);
      }
    }
  } else {
    const department = typeof req.query.department === "string" ? req.query.department : null;
    for (const { shard, pool } of ownedShardPools()) {
      try {
        const r = await pool.query(
          "SELECT employee_id, name, email, department, designation, status FROM employees WHERE bucket_id = ANY($2) AND ($1::text IS NULL OR department = $1) ORDER BY name LIMIT 50",
          [department, owned[shard] ?? []]
        );
        out.push(...r.rows);
      } catch {
        unavailable.push(shard);
      }
    }
  }
  res.json({ success: true, data: out, meta: partialMeta(unavailable) });
});

interface EmployeeRow {
  employee_id: string;
  bucket_id: number;
  display_id: string;
  email: string;
  name: string;
  department: string;
  designation: string;
  status: string;
  manager_id: string | null;
  version: number;
}

async function shardRow(employeeId: string): Promise<{ shard: string; row: EmployeeRow } | null> {
  const { map } = await loadActiveMap(catalogPool);
  const shard = resolveShard(employeeId, map);
  const pool = poolFor(shard);
  if (!pool) return null;
  const r = await pool.query("SELECT employee_id, bucket_id, display_id, email, name, department, designation, status, manager_id, version FROM employees WHERE employee_id = $1", [employeeId]);
  if (r.rows.length === 0) return null;
  return { shard, row: r.rows[0] as EmployeeRow };
}

/** HR/ADMIN, the person themselves, or their direct manager may see the record. */
async function canSee(req: AuthedRequest, row: Pick<EmployeeRow, "email" | "manager_id">): Promise<boolean> {
  const roles = req.roles ?? [];
  if (roles.includes("HR") || roles.includes("ADMIN")) return true;
  const u = await catalogPool.query("SELECT email_norm FROM users WHERE user_id = $1", [req.userId]);
  if (u.rows.length > 0 && (u.rows[0].email_norm as string) === row.email) return true;
  if (row.manager_id) {
    const me = await selfEmployeeId(req);
    if (me && me === row.manager_id) return true;
  }
  return false;
}

employeesRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const found = await shardRow(req.params.id);
  if (!found) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Employee not found"));
    return;
  }
  if (!(await canSee(req, found.row))) {
    res.status(403).json(errorEnvelope("FORBIDDEN", "Insufficient role"));
    return;
  }
  res.json({ success: true, data: found.row });
});

employeesRouter.get("/:id/activity", requireAuth, async (req: AuthedRequest, res) => {
  const found = await shardRow(req.params.id);
  if (!found) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Employee not found"));
    return;
  }
  if (!(await canSee(req, found.row))) {
    res.status(403).json(errorEnvelope("FORBIDDEN", "Insufficient role"));
    return;
  }
  const pool = poolFor(found.shard);
  if (!pool) {
    res.status(500).json(errorEnvelope("ROUTING_ERROR", "No shard owns this record"));
    return;
  }
  const [attendance, leave, payroll] = await Promise.all([
    pool.query("SELECT workday::text AS workday, check_in, check_out, status FROM attendance WHERE employee_id = $1 ORDER BY workday DESC LIMIT 30", [
      req.params.id,
    ]),
    pool.query(
      "SELECT request_id, leave_type, start_date::text AS start_date, end_date::text AS end_date, workdays, status, version, created_at FROM leave_requests WHERE employee_id = $1 ORDER BY created_at DESC LIMIT 20",
      [req.params.id]
    ),
    pool.query(
      "SELECT record_id, period, gross_paise, lop_paise, net_paise, scheduled_days, paid_days, created_at FROM payroll_records WHERE employee_id = $1 ORDER BY period DESC LIMIT 12",
      [req.params.id]
    ),
  ]);
  res.json({ success: true, data: { attendance: attendance.rows, leave: leave.rows, payroll: payroll.rows } });
});

employeesRouter.patch("/:id", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const { name, department, designation, version, managerId } = req.body as {
    name?: string;
    department?: string;
    designation?: string;
    version?: number;
    managerId?: string | null;
  };
  if (typeof version !== "number") {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Current version is required"));
    return;
  }
  let eventId: string;
  try {
    eventId = nextEventId();
  } catch (e) {
    if (e instanceof LeaseExpiredError) {
      leaseError(res);
      return;
    }
    throw e;
  }
  const { map } = await loadActiveMap(catalogPool);
  const shard = resolveShard(req.params.id, map);
  const pool = poolFor(shard);
  if (!pool) {
    res.status(500).json(errorEnvelope("ROUTING_ERROR", "No shard owns this record"));
    return;
  }
  try {
    const updated = await fencedWrite(pool, async (c) => {
      if (managerId !== undefined) {
        if (managerId === req.params.id) {
          throw new Error("SELF_MANAGER");
        }
        if (managerId !== null) {
          const exists = await c.query("SELECT 1 FROM employees WHERE employee_id = $1", [managerId]);
          if (exists.rows.length === 0) {
            const dir = await catalogPool.query("SELECT 1 FROM employee_directory WHERE employee_id = $1", [managerId]);
            if (dir.rows.length === 0) throw new Error("UNKNOWN_MANAGER");
          }
        }
      }
      const r = await c.query(
        "UPDATE employees SET name = COALESCE($2, name), department = COALESCE($3, department), designation = COALESCE($4, designation), manager_id = COALESCE($6, manager_id), version = version + 1, updated_at = now() WHERE employee_id = $1 AND version = $5 RETURNING employee_id, bucket_id, name, email, department, designation, manager_id, version",
        [req.params.id, name ?? null, department ?? null, designation ?? null, version, managerId ?? null]
      );
      if (r.rows.length === 0) return null;
      const row = r.rows[0] as { employee_id: string; bucket_id: number; name: string; email: string; department: string; designation: string; version: number };
      await c.query("INSERT INTO outbox_events (event_id, employee_id, bucket_id, type, payload, version) VALUES ($1,$2,$3,'EMPLOYEE_UPDATED',$4,$5)", [
        eventId,
        row.employee_id,
        row.bucket_id,
        JSON.stringify({ name: row.name, email: row.email, department: row.department, designation: row.designation }),
        row.version,
      ]);
      await c.query("INSERT INTO outbox_events (event_id, employee_id, bucket_id, type, payload, version) VALUES ($1,$2,$3,'AUDIT',$4,$5)", [
        `${eventId}-audit`,
        row.employee_id,
        row.bucket_id,
        JSON.stringify({ actor: req.userId ?? "", action: "employee.updated", resource: `employee:${row.employee_id}` }),
        row.version,
      ]);
      return row;
    });
    if (!updated) {
      res.status(409).json(errorEnvelope("VERSION_CONFLICT", "This record changed. Reload and try again."));
      return;
    }
    res.json({ success: true, data: updated });
  } catch (e) {
    if (e instanceof GateClosedError) {
      res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
      return;
    }
    if ((e as Error).message === "SELF_MANAGER" || (e as Error).message === "UNKNOWN_MANAGER") {
      res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Choose a valid manager"));
      return;
    }
    throw e;
  }
});

employeesRouter.post("/:id/deactivate", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  let eventId: string;
  try {
    eventId = nextEventId();
  } catch (e) {
    if (e instanceof LeaseExpiredError) {
      leaseError(res);
      return;
    }
    throw e;
  }
  const { map } = await loadActiveMap(catalogPool);
  const shard = resolveShard(req.params.id, map);
  const pool = poolFor(shard);
  if (!pool) {
    res.status(500).json(errorEnvelope("ROUTING_ERROR", "No shard owns this record"));
    return;
  }
  const pre = await pool.query("SELECT email FROM employees WHERE employee_id = $1", [req.params.id]);
  if (pre.rows.length === 0) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Employee not found or already inactive"));
    return;
  }
  const email = (pre.rows[0] as { email: string }).email;
  const gateClient = await catalogPool.connect();
  try {
    await gateClient.query("BEGIN");
    await assertCatalogOpen(gateClient);
    await gateClient.query("UPDATE users SET status = 'INACTIVE' WHERE email_norm = $1", [email]);
    await gateClient.query("COMMIT");
  } catch (e) {
    await gateClient.query("ROLLBACK");
    if (e instanceof CatalogGateError) {
      gateError(res);
      return;
    }
    throw e;
  } finally {
    gateClient.release();
  }
  const u = await catalogPool.query("SELECT user_id FROM users WHERE email_norm = $1", [email]);
  if (u.rows.length > 0) await destroyUserSessions(u.rows[0].user_id as string);
  const { map: reassignMap } = await loadActiveMap(catalogPool);
  try {
    const row = await fencedWrite(pool, async (c) => {
      const r = await c.query("UPDATE employees SET status = 'INACTIVE', version = version + 1, updated_at = now() WHERE employee_id = $1 AND status <> 'INACTIVE' RETURNING employee_id, bucket_id, name, email, version", [req.params.id]);
      if (r.rows.length === 0) return null;
      const emp = r.rows[0] as { employee_id: string; bucket_id: number; name: string; email: string; version: number };
      await c.query("INSERT INTO outbox_events (event_id, employee_id, bucket_id, type, payload, version) VALUES ($1,$2,$3,'EMPLOYEE_DEACTIVATED',$4,$5)", [
        eventId,
        emp.employee_id,
        emp.bucket_id,
        JSON.stringify({ name: emp.name, email: emp.email }),
        emp.version,
      ]);
      await c.query("INSERT INTO outbox_events (event_id, employee_id, bucket_id, type, payload, version) VALUES ($1,$2,$3,'AUDIT',$4,$5)", [
        `${eventId}-audit`,
        emp.employee_id,
        emp.bucket_id,
        JSON.stringify({ actor: req.userId ?? "", action: "employee.deactivated", resource: `employee:${emp.employee_id}` }),
        emp.version,
      ]);
      return emp;
    });
    if (!row) {
      res.status(404).json(errorEnvelope("NOT_FOUND", "Employee not found or already inactive"));
      return;
    }
    for (const { shard: reShard, pool: rePool } of ownedShardPools()) {
      const owned = [...reassignMap].filter(([, s]) => s === reShard).map(([b]) => b);
      await fencedWrite(rePool, async (c) => {
        await c.query(
          "UPDATE leave_requests SET status = 'PENDING_HR', version = version + 1 WHERE status = 'PENDING_MANAGER' AND bucket_id = ANY($2) AND employee_id IN (SELECT employee_id FROM employees WHERE manager_id = $1)",
          [req.params.id, owned]
        );
      });
    }
    res.json({ success: true, data: { employeeId: row.employee_id } });
  } catch (e) {
    if (e instanceof GateClosedError) {
      res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
      return;
    }
    throw e;
  }
});
