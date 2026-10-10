import { Router } from "express";
import { errorEnvelope, prefixesFor, suggestKey, suggestMember, AUTOCOMPLETE_TOP_K } from "@hrms/core";
import { catalogPool, shardPools } from "../db/pools.js";
import { redisKv } from "../db/redis.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";
import { writeAudit } from "../audit/audit.js";

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
