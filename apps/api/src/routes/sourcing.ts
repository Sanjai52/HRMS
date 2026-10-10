import { Router } from "express";
import { errorEnvelope, BullMqJobQueue } from "@hrms/core";
import { nextEventId } from "../ids.js";
import { LeaseExpiredError } from "@hrms/core";
import { catalogPool } from "../db/pools.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";
import { searchLimit } from "../middleware/rate-limit.js";
import { writeAudit } from "../audit/audit.js";

export const sourcingRouter = Router();

sourcingRouter.post("/runs", requireAuth, requireRoles("HR", "ADMIN"), searchLimit, async (req: AuthedRequest, res) => {
  const { role, skills } = req.body as { role?: string; skills?: unknown };
  const skillList = Array.isArray(skills) ? skills.filter((s): s is string => typeof s === "string").map((s) => s.trim()).filter(Boolean).slice(0, 20) : [];
  let runId: string;
  try {
    runId = nextEventId();
  } catch (e) {
    if (e instanceof LeaseExpiredError) {
      res.status(503).json(errorEnvelope("ID_LEASE_UNAVAILABLE", "ID generation is paused. Try again shortly."));
      return;
    }
    throw e;
  }
  await catalogPool.query("INSERT INTO crawl_runs (run_id, role, skills, status, created_by) VALUES ($1, $2, $3, 'PENDING', $4)", [
    runId,
    typeof role === "string" ? role.slice(0, 120) : "",
    skillList,
    req.userId ?? "",
  ]);
  const queue = new BullMqJobQueue(process.env.REDIS_QUEUE_URL ?? "redis://localhost:6379");
  try {
    await queue.enqueue("crawler-run", { runId }, { jobId: `crawl-${runId}` });
  } catch (e) {
    await catalogPool.query("UPDATE crawl_runs SET status = 'FAILED' WHERE run_id = $1", [runId]);
    await queue.close().catch(() => undefined);
    console.error(`crawl enqueue failed for ${runId}:`, (e as Error).message);
    res.status(502).json(errorEnvelope("QUEUE_UNAVAILABLE", "Crawl queue is unavailable."));
    return;
  }
  await queue.close().catch(() => undefined);
  await writeAudit(catalogPool, { actor: req.userId ?? "", action: "crawl.started", resource: `crawl:${runId}`, metadata: { role, skills: skillList } });
  res.status(202).json({ success: true, data: { runId } });
});

sourcingRouter.get("/runs", requireAuth, requireRoles("HR", "ADMIN"), async (_req, res) => {
  const rows = await catalogPool.query("SELECT * FROM crawl_runs ORDER BY created_at DESC LIMIT 30");
  res.json({ success: true, data: rows.rows });
});

sourcingRouter.get("/runs/:id", requireAuth, requireRoles("HR", "ADMIN"), async (req, res) => {
  const run = await catalogPool.query("SELECT * FROM crawl_runs WHERE run_id = $1", [req.params.id]);
  if (run.rows.length === 0) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Crawl run not found"));
    return;
  }
  const pages = await catalogPool.query("SELECT url, status, error FROM crawl_pages WHERE run_id = $1 ORDER BY url", [req.params.id]);
  res.json({ success: true, data: { run: run.rows[0], pages: pages.rows } });
});
