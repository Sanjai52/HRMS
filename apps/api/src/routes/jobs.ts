import { Router } from "express";
import { errorEnvelope, slugify, randomCode, isAllowedDestination } from "@hrms/core";
import { nextEventId } from "../ids.js";
import { LeaseExpiredError } from "@hrms/core";
import { catalogPool } from "../db/pools.js";
import { kv, redisKv } from "../db/redis.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";
import { shortLinkLimit } from "../middleware/rate-limit.js";
import { writeAudit } from "../audit/audit.js";
import { assertCatalogOpen, CatalogGateError, gateError } from "../catalog-gate.js";

export const jobsRouter = Router();

jobsRouter.get("/", async (_req, res) => {
  const rows = await catalogPool.query(
    "SELECT job_id, slug, title, department, location, employment_type, salary_range, created_at, closing_date FROM jobs WHERE status = 'OPEN' ORDER BY created_at DESC LIMIT 50"
  );
  res.json({ success: true, data: rows.rows });
});

jobsRouter.get("/:slug", async (req, res) => {
  const rows = await catalogPool.query("SELECT * FROM jobs WHERE slug = $1 AND status = 'OPEN'", [req.params.slug]);
  if (rows.rows.length === 0) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Job not found"));
    return;
  }
  const row = rows.rows[0] as Record<string, unknown>;
  delete row.created_by;
  res.json({ success: true, data: row });
});

jobsRouter.post("/", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const { title, department, description, requiredSkills, experience, location, employmentType, salaryRange, closingDate } = req.body as Record<string, unknown>;
  if (typeof title !== "string" || title.trim().length < 3) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Job title is required"));
    return;
  }
  let jobId: string;
  try {
    jobId = nextEventId();
  } catch (e) {
    if (e instanceof LeaseExpiredError) {
      res.status(503).json(errorEnvelope("ID_LEASE_UNAVAILABLE", "ID generation is paused. Try again shortly."));
      return;
    }
    throw e;
  }
  const base = slugify(title);
  const slug = `${base}-${jobId.slice(-6)}`;
  const client = await catalogPool.connect();
  try {
    await client.query("BEGIN");
    await assertCatalogOpen(client);
    await client.query(
      "INSERT INTO jobs (job_id, slug, title, department, description, required_skills, experience, location, employment_type, salary_range, status, created_by, closing_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'OPEN',$11,$12)",
      [jobId, slug, title.trim(), (department as string) ?? "", (description as string) ?? "", (requiredSkills as string[]) ?? [], (experience as string) ?? "", (location as string) ?? "", (employmentType as string) ?? "FULL_TIME", (salaryRange as string) ?? "", req.userId ?? "", (closingDate as string) ?? null]
    );
    await writeAudit({ query: client.query.bind(client) }, { actor: req.userId ?? "", action: "job.created", resource: `job:${jobId}`, metadata: { title } });
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
  res.status(201).json({ success: true, data: { jobId, slug } });
});

jobsRouter.post("/:jobId/close", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const client = await catalogPool.connect();
  try {
    await client.query("BEGIN");
    await assertCatalogOpen(client);
    const r = await client.query("UPDATE jobs SET status = 'CLOSED' WHERE job_id = $1 AND status = 'OPEN' RETURNING job_id", [req.params.jobId]);
    if (r.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json(errorEnvelope("NOT_FOUND", "Open job not found"));
      return;
    }
    await writeAudit({ query: client.query.bind(client) }, { actor: req.userId ?? "", action: "job.closed", resource: `job:${req.params.jobId}` });
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
  res.json({ success: true, data: { jobId: req.params.jobId } });
});

export const shortRouter = Router();

shortRouter.post("/short-urls", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {  const { destination } = req.body as { destination?: string };
  if (typeof destination !== "string" || !isAllowedDestination(destination)) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Only /jobs and /jobs/* destinations are allowed"));
    return;
  }
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    const client = await catalogPool.connect();
    try {
      await client.query("BEGIN");
      await assertCatalogOpen(client);
      await client.query("INSERT INTO short_urls (code, destination) VALUES ($1, $2)", [code, destination]);
      await writeAudit({ query: client.query.bind(client) }, { actor: req.userId ?? "", action: "shortlink.created", resource: `short:${code}`, metadata: { destination } });
      await client.query("COMMIT");
      res.status(201).json({ success: true, data: { code, destination } });
      return;
    } catch (e: unknown) {
      await client.query("ROLLBACK");
      if (e instanceof CatalogGateError) {
        gateError(res);
        return;
      }
      if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "23505") continue;
      throw e;
    } finally {
      client.release();
    }
  }
  res.status(500).json(errorEnvelope("CODE_COLLISION", "Could not mint a unique code. Try again."));
});

export const publicRouter = Router();

publicRouter.get("/s/:code", shortLinkLimit, async (req, res) => {
  const code = req.params.code;
  if (!/^[0-9A-Za-z]{4,16}$/.test(code)) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Unknown link"));
    return;
  }
  try {
    const cached = await kv().get(`short:${code}`);
    if (cached) {
      // Click counters are not part of KvStore; the raw client keeps them.
      await redisKv().incr(`shortclick:${code}`);
      res.redirect(302, `${process.env.WEB_ORIGIN ?? "http://localhost:3000"}${cached}`);
      return;
    }
  } catch {
    res.status(503).json(errorEnvelope("LIMITER_UNAVAILABLE", "Link service is unavailable. Try again shortly."));
    return;
  }
  const rows = await catalogPool.query("SELECT destination, active FROM short_urls WHERE code = $1", [code]);
  if (rows.rows.length === 0 || !(rows.rows[0] as { active: boolean }).active) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Unknown link"));
    return;
  }
  const dest = (rows.rows[0] as { destination: string }).destination;
  await kv().set(`short:${code}`, dest, 3600).catch(() => undefined);
  await catalogPool.query("UPDATE short_urls SET clicks = clicks + 1 WHERE code = $1", [code]);
  res.redirect(302, `${process.env.WEB_ORIGIN ?? "http://localhost:3000"}${dest}`);
});
