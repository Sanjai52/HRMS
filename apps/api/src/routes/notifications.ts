import { Router } from "express";
import { errorEnvelope, GateClosedError, BullMqJobQueue, loadActiveMap } from "@hrms/core";
import { fencedWrite } from "../fenced.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";
import { selfEmployeeId, shardFor } from "../directory/self.js";
import { catalogPool } from "../db/pools.js";
import { nextEventId } from "../ids.js";
import { LeaseExpiredError } from "@hrms/core";
import { writeAudit } from "../audit/audit.js";
import { assertCatalogOpen, CatalogGateError, gateError } from "../catalog-gate.js";

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

notificationsRouter.get("/prefs", requireAuth, async (req: AuthedRequest, res) => {
  const r = await catalogPool.query("SELECT email_enabled, in_app_enabled FROM notification_prefs WHERE user_id = $1", [req.userId]);
  const prefs = (r.rows[0] as { email_enabled: boolean; in_app_enabled: boolean } | undefined) ?? { email_enabled: true, in_app_enabled: true };
  res.json({ success: true, data: prefs });
});

notificationsRouter.put("/prefs", requireAuth, async (req: AuthedRequest, res) => {
  const { email_enabled, in_app_enabled } = req.body as { email_enabled?: unknown; in_app_enabled?: unknown };
  if (typeof email_enabled !== "boolean" || typeof in_app_enabled !== "boolean") {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "email_enabled and in_app_enabled must be booleans"));
    return;
  }
  await catalogPool.query(
    "INSERT INTO notification_prefs (user_id, email_enabled, in_app_enabled) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET email_enabled = EXCLUDED.email_enabled, in_app_enabled = EXCLUDED.in_app_enabled",
    [req.userId, email_enabled, in_app_enabled]
  );
  res.json({ success: true, data: { email_enabled, in_app_enabled } });
});

notificationsRouter.post("/announcements", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const { title, body } = req.body as { title?: string; body?: string };
  if (typeof title !== "string" || title.trim().length < 3) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "A title of 3+ characters is required"));
    return;
  }
  let announcementId: string;
  try {
    announcementId = nextEventId();
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
    await client.query("INSERT INTO announcements (announcement_id, title, body, created_by) VALUES ($1,$2,$3,$4)", [
      announcementId,
      title.trim(),
      typeof body === "string" ? body : "",
      req.userId ?? "",
    ]);
    await writeAudit({ query: client.query.bind(client) }, {
      actor: req.userId ?? "",
      action: "announcement.created",
      resource: `announcement:${announcementId}`,
      metadata: { title: title.trim() },
    });
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

  const { map } = await loadActiveMap(catalogPool);
  const activeShards = [...new Set(map.values())].sort();
  const queue = new BullMqJobQueue(process.env.REDIS_QUEUE_URL ?? "redis://localhost:6379");
  try {
    for (const shard of activeShards) {
      await queue.enqueue("announcement-fanout", { announcementId, shard }, { jobId: `announce-${announcementId}-${shard}` });
    }
  } catch (e) {
    await queue.close().catch(() => undefined);
    res.status(502).json(errorEnvelope("QUEUE_UNAVAILABLE", `Announcement saved but fan-out enqueue failed: ${(e as Error).message}`));
    return;
  }
  await queue.close().catch(() => undefined);
  res.status(201).json({ success: true, data: { announcementId, shards: activeShards } });
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
    await fencedWrite(t.pool, async (c) => {
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
