import { Router } from "express";
import { errorEnvelope } from "@hrms/core";
import { catalogPool } from "../db/pools.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

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
