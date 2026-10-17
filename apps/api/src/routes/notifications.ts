import { Router } from "express";
import { errorEnvelope, withFencedWrite, GateClosedError } from "@hrms/core";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { selfEmployeeId, shardFor } from "../directory/self.js";

export const notificationsRouter = Router();

notificationsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
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
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const rows = await t.pool.query(
    "SELECT notification_id, kind, title, body, read_at, created_at FROM notifications WHERE employee_id = $1 ORDER BY created_at DESC LIMIT $2",
    [me, limit]
  );
  res.json({ success: true, data: rows.rows });
});

notificationsRouter.get("/unread-count", requireAuth, async (req: AuthedRequest, res) => {
  const me = await selfEmployeeId(req);
  if (!me) {
    res.json({ success: true, data: { count: 0 } });
    return;
  }
  const t = await shardFor(me);
  if (!t) {
    res.status(500).json(errorEnvelope("ROUTING_ERROR", "No shard owns this record"));
    return;
  }
  const rows = await t.pool.query("SELECT COUNT(*) AS c FROM notifications WHERE employee_id = $1 AND read_at IS NULL", [me]);
  res.json({ success: true, data: { count: Number((rows.rows[0] as { c: string }).c) } });
});

notificationsRouter.post("/:id/read", requireAuth, async (req: AuthedRequest, res) => {
  const me = await selfEmployeeId(req);
  if (!me) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "No employee record for this account yet"));
    return;
  }
  const t = await shardFor(me);
  if (!t) {
    res.status(500).json(errorEnvelope("ROUTING_ERROR", "No shard owns this record"));
    return;
  }
  try {
    await withFencedWrite(t.pool, async (c) => {
      await c.query("UPDATE notifications SET read_at = now() WHERE notification_id = $1 AND employee_id = $2", [req.params.id, me]);
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
