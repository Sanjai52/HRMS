import { Router } from "express";
import { catalogPool } from "../db/pools.js";
import { ownedShardPools, partialMeta } from "../db/shards.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { ownedBuckets } from "../directory/self.js";

export const reportsRouter = Router();

reportsRouter.get("/overview", requireAuth, requireRoles("HR", "ADMIN"), async (req, res) => {
  const month = typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : new Date().toISOString().slice(0, 7);
  const owned = await ownedBuckets();

  const headcount = await catalogPool.query(
    "SELECT department, COUNT(*) AS n FROM employee_directory WHERE status = 'ACTIVE' GROUP BY department ORDER BY n DESC"
  );

  const attendance = { present: 0, late: 0, records: 0 };
  const unavailable: string[] = [];
  for (const { shard, pool } of ownedShardPools()) {
    try {
      const r = await pool.query(
        "SELECT status, COUNT(*) AS n FROM attendance WHERE bucket_id = ANY($2) AND workday >= ($1 || '-01')::date AND workday < (($1 || '-01')::date + interval '1 month') GROUP BY status",
        [month, owned[shard] ?? []]
      );
      for (const row of r.rows as Array<{ status: string; n: string }>) {
        attendance.records += Number(row.n);
        if (row.status === "PRESENT") attendance.present += Number(row.n);
        if (row.status === "LATE") attendance.late += Number(row.n);
      }
    } catch {
      unavailable.push(shard);
    }
  }

  const leave: Record<string, number> = {};
  for (const { shard, pool } of ownedShardPools()) {
    try {
      const r = await pool.query("SELECT status, COUNT(*) AS n FROM leave_requests WHERE bucket_id = ANY($1) GROUP BY status", [owned[shard] ?? []]);
      for (const row of r.rows as Array<{ status: string; n: string }>) {
        leave[row.status] = (leave[row.status] ?? 0) + Number(row.n);
      }
    } catch {
      unavailable.push(shard);
    }
  }

  const payroll = await catalogPool.query(
    "SELECT period, status, done, failed, skipped FROM payroll_batches ORDER BY period DESC LIMIT 6"
  );

  const funnel: Record<string, number> = {};
  const ownedC: Record<string, number[]> = {};
  const cmapRows = await catalogPool.query("SELECT bucket_id, shard_id FROM routing_map_buckets WHERE version = (SELECT version FROM routing_map_versions WHERE domain = 'candidate' AND active = TRUE)");
  for (const row of cmapRows.rows as Array<{ bucket_id: number; shard_id: string }>) {
    (ownedC[row.shard_id] ??= []).push(row.bucket_id);
  }
  for (const { shard, pool } of ownedShardPools()) {
    try {
      const r = await pool.query("SELECT stage, COUNT(*) AS n FROM applications WHERE candidate_bucket_id = ANY($1) GROUP BY stage", [ownedC[shard] ?? []]);
      for (const row of r.rows as Array<{ stage: string; n: string }>) {
        funnel[row.stage] = (funnel[row.stage] ?? 0) + Number(row.n);
      }
    } catch {
      unavailable.push(shard);
    }
  }

  res.json({ success: true, data: { month, headcount: headcount.rows, attendance, leave, payroll: payroll.rows, funnel }, meta: partialMeta(unavailable) });
});
