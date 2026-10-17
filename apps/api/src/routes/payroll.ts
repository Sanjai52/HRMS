import { Router } from "express";
import {
  errorEnvelope,
  loadActiveMap,
  resolveShard,
  GateClosedError,
} from "@hrms/core";
import { fencedWrite } from "../fenced.js";
import { nextEventId } from "../ids.js";
import { LeaseExpiredError } from "@hrms/core";
import { catalogPool } from "../db/pools.js";
import { ownedShardPools, partialMeta, poolFor } from "../db/shards.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";
import { selfEmployeeId, shardFor, ownedBuckets } from "../directory/self.js";
import { BullMqJobQueue } from "@hrms/core";
import { assertCatalogOpen, CatalogGateError, gateError } from "../catalog-gate.js";

export const payrollRouter = Router();

function paise(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}

payrollRouter.post("/structures", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const { employeeId, basicPaise, allowancesPaise, otherDeductionsPaise, pfPct, taxPct } = req.body as Record<string, unknown>;
  if (typeof employeeId !== "string") {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "employeeId is required"));
    return;
  }
  const basic = paise(basicPaise);
  const allow = paise(allowancesPaise ?? 0) ?? -1;
  const other = paise(otherDeductionsPaise ?? 0) ?? -1;
  const pf = pfPct === undefined ? 0 : typeof pfPct === "number" && pfPct >= 0 && pfPct <= 100 ? pfPct : -1;
  const tax = taxPct === undefined ? 0 : typeof taxPct === "number" && taxPct >= 0 && taxPct <= 100 ? taxPct : -1;
  if (basic === null || allow < 0 || other < 0 || pf < 0 || tax < 0) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Amounts must be non-negative paise integers; percents 0–100"));
    return;
  }
  const { map } = await loadActiveMap(catalogPool);
  const shard = resolveShard(employeeId, map);
  const pool = poolFor(shard);
  if (!pool) {
    res.status(500).json(errorEnvelope("ROUTING_ERROR", "No shard owns this record"));
    return;
  }
  const exists = await pool.query("SELECT 1 FROM employees WHERE employee_id = $1", [employeeId]);
  if (exists.rows.length === 0) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Employee not found"));
    return;
  }
  try {
    await fencedWrite(pool, async (c) => {
      const bucket = (await c.query("SELECT bucket_id FROM employees WHERE employee_id = $1", [employeeId])).rows[0].bucket_id as number;
      await c.query(
        "INSERT INTO salary_structures (employee_id, bucket_id, basic_paise, allowances_paise, other_deductions_paise, pf_pct, tax_pct, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT (employee_id) DO UPDATE SET basic_paise = EXCLUDED.basic_paise, allowances_paise = EXCLUDED.allowances_paise, other_deductions_paise = EXCLUDED.other_deductions_paise, pf_pct = EXCLUDED.pf_pct, tax_pct = EXCLUDED.tax_pct, updated_at = now()",
        [employeeId, bucket, basic, allow, other, pf, tax]
      );
    });
    res.json({ success: true, data: { employeeId } });
  } catch (e) {
    if (e instanceof GateClosedError) {
      res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
      return;
    }
    throw e;
  }
});

payrollRouter.get("/structures/:employeeId", requireAuth, async (req: AuthedRequest, res) => {
  const roles = req.roles ?? [];
  if (!roles.includes("HR") && !roles.includes("ADMIN")) {
    const me = await selfEmployeeId(req);
    if (me !== req.params.employeeId) {
      res.status(403).json(errorEnvelope("FORBIDDEN", "Payroll details are restricted"));
      return;
    }
  }
  const { map } = await loadActiveMap(catalogPool);
  const pool = poolFor(resolveShard(req.params.employeeId, map));
  if (!pool) {
    res.status(500).json(errorEnvelope("ROUTING_ERROR", "No shard owns this record"));
    return;
  }
  const r = await pool.query("SELECT * FROM salary_structures WHERE employee_id = $1", [req.params.employeeId]);
  res.json({ success: true, data: r.rows[0] ?? null });
});

payrollRouter.post("/batches", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const { period } = req.body as { period?: string };
  if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "period as YYYY-MM is required"));
    return;
  }
  let batchId: string;
  try {
    batchId = nextEventId();
  } catch (e) {
    if (e instanceof LeaseExpiredError) {
      res.status(503).json(errorEnvelope("ID_LEASE_UNAVAILABLE", "ID generation is paused. Try again shortly."));
      return;
    }
    throw e;
  }
  const client = await catalogPool.connect();
  try {
    await client.query("BEGIN");
    await assertCatalogOpen(client);
    await client.query("INSERT INTO payroll_batches (batch_id, period, status, created_by) VALUES ($1, $2, 'PENDING', $3)", [batchId, period, req.userId ?? ""]);
    await client.query("INSERT INTO audit_logs (event_id, actor, action, resource, metadata) VALUES ($1, $2, 'payroll.batch_created', $3, $4)", [
      `${batchId}-audit`,
      req.userId ?? "",
      `payroll-batch:${batchId}`,
      JSON.stringify({ period }),
    ]);
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
  const queue = new BullMqJobQueue(process.env.REDIS_QUEUE_URL ?? "redis://localhost:6379");
  try {
    for (const shard of ["shard-1", "shard-2", "shard-3"]) {
      await queue.enqueue("payroll-chunk", { batchId, period, shard }, { jobId: `${batchId}-${shard}` });
    }
  } catch (e) {
    console.error(`payroll enqueue failed for ${batchId}:`, (e as Error).message);
    const failClient = await catalogPool.connect();
    try {
      await failClient.query("BEGIN");
      await assertCatalogOpen(failClient);
      await failClient.query("UPDATE payroll_batches SET status = 'FAILED' WHERE batch_id = $1", [batchId]);
      await failClient.query("COMMIT");
    } catch (markErr) {
      await failClient.query("ROLLBACK").catch(() => undefined);
      if (!(markErr instanceof CatalogGateError)) throw markErr;
      console.error(`payroll batch ${batchId}: catalog gated, batch left PENDING after enqueue failure`);
    } finally {
      failClient.release();
    }
    await queue.close().catch(() => undefined);
    res.status(502).json(errorEnvelope("QUEUE_UNAVAILABLE", "Payroll queue is unavailable. The batch was marked failed."));
    return;
  } finally {
    await queue.close().catch(() => undefined);
  }
  res.status(202).json({ success: true, data: { batchId, period, status: "PENDING" } });
});

payrollRouter.get("/batches", requireAuth, requireRoles("HR", "ADMIN"), async (_req, res) => {
  const rows = await catalogPool.query("SELECT * FROM payroll_batches ORDER BY created_at DESC LIMIT 50");
  res.json({ success: true, data: rows.rows });
});

payrollRouter.get("/batches/:id", requireAuth, requireRoles("HR", "ADMIN"), async (req, res) => {
  const b = await catalogPool.query("SELECT * FROM payroll_batches WHERE batch_id = $1", [req.params.id]);
  if (b.rows.length === 0) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Batch not found"));
    return;
  }
  const owned = await ownedBuckets();
  const period = (b.rows[0] as { period: string }).period;
  const records: unknown[] = [];
  const unavailable: string[] = [];
  for (const { shard, pool } of ownedShardPools()) {
    try {
      const r = await pool.query(
        "SELECT pr.*, e.name FROM payroll_records pr JOIN employees e ON e.employee_id = pr.employee_id WHERE pr.bucket_id = ANY($2) AND pr.period = $1 ORDER BY e.name LIMIT 200",
        [period, owned[shard] ?? []]
      );
      records.push(...r.rows);
    } catch {
      unavailable.push(shard);
    }
  }
  res.json({ success: true, data: { batch: b.rows[0], records }, meta: partialMeta(unavailable) });
});

payrollRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
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
  const period = typeof req.query.period === "string" ? req.query.period : null;
  const rows = period
    ? await t.pool.query("SELECT * FROM payroll_records WHERE employee_id = $1 AND period = $2", [me, period])
    : await t.pool.query("SELECT * FROM payroll_records WHERE employee_id = $1 ORDER BY period DESC LIMIT 12", [me]);
  res.json({ success: true, data: rows.rows });
});

payrollRouter.get("/payslips/:id", requireAuth, async (req: AuthedRequest, res) => {
  const roles = req.roles ?? [];
  const owned = await ownedBuckets();
  let found: Record<string, unknown> | null = null;
  for (const { shard, pool } of ownedShardPools()) {
    const r = await pool.query(
      "SELECT pr.*, e.name, e.email FROM payroll_records pr JOIN employees e ON e.employee_id = pr.employee_id WHERE pr.record_id = $1 AND pr.bucket_id = ANY($2)",
      [req.params.id, owned[shard] ?? []]
    );
    if (r.rows.length > 0) {
      found = r.rows[0] as Record<string, unknown>;
      break;
    }
  }
  if (!found) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Payslip not found"));
    return;
  }
  if (!roles.includes("HR") && !roles.includes("ADMIN")) {
    const me = await selfEmployeeId(req);
    if (me !== found.employee_id) {
      res.status(403).json(errorEnvelope("FORBIDDEN", "Payslip details are restricted"));
      return;
    }
  }
  res.json({ success: true, data: found });
});

