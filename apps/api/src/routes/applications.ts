import { Router } from "express";
import multer from "multer";
import { randomBytes, randomUUID } from "node:crypto";
import {
  errorEnvelope,
  loadMapByDomain,
  stableEmployeeBucket,
  canTransition,
  GateClosedError,
} from "@hrms/core";
import { fencedWrite } from "../fenced.js";
import { nextEventId } from "../ids.js";
import { LeaseExpiredError } from "@hrms/core";
import { catalogPool } from "../db/pools.js";
import { ownedShardPools, partialMeta, poolFor, type ShardPool } from "../db/shards.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";
import { publicApplyLimit, shortLinkLimit } from "../middleware/rate-limit.js";
import { writeAudit } from "../audit/audit.js";
import { assertCatalogOpen, CatalogGateError, gateError } from "../catalog-gate.js";
import { createStorage } from "../storage/minio.js";
import { hashToken } from "../auth/sessions.js";

export const applicationsRouter = Router();

const CANDIDATE_DOMAIN = "candidate";

async function candidatePool(candidateId: string): Promise<{ pool: ShardPool; bucket: number; shard: string } | null> {
  const { map } = await loadMapByDomain(catalogPool, CANDIDATE_DOMAIN);
  const bucket = stableEmployeeBucket(candidateId);
  const shard = map.get(bucket);
  const pool = shard ? poolFor(shard) : undefined;
  return pool ? { pool, bucket, shard: shard as string } : null;
}

async function routeApplication(applicationId: string): Promise<{ pool: ShardPool; bucket: number; candidateId: string; jobId: string } | null> {
  const idx = await catalogPool.query("SELECT candidate_id, job_id FROM application_index WHERE application_id = $1", [applicationId]);
  if (idx.rows.length === 0) return null;
  const candidateId = (idx.rows[0] as { candidate_id: string }).candidate_id;
  const route = await candidatePool(candidateId);
  if (!route) return null;
  return { pool: route.pool, bucket: route.bucket, candidateId, jobId: (idx.rows[0] as { job_id: string }).job_id };
}

applicationsRouter.post(
  "/jobs/:jobId/applications",
  publicApplyLimit,
  multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single("resume"),
  async (req, res) => {
    const job = await catalogPool.query("SELECT job_id, title FROM jobs WHERE job_id = $1 AND status = 'OPEN'", [req.params.jobId]);
    if (job.rows.length === 0) {
      res.status(404).json(errorEnvelope("NOT_FOUND", "This role is no longer open"));
      return;
    }
    const { name, email, phone, skills, experience } = req.body as Record<string, unknown>;
    if (typeof name !== "string" || name.trim().length < 2 || typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) {
      res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Name and a valid email are required"));
      return;
    }
    const norm = email.trim().toLowerCase();
    const skillList = Array.isArray(skills)
      ? (skills as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 30)
      : typeof skills === "string"
        ? skills.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30)
        : [];
    const expYears = typeof experience === "number" && experience >= 0 && experience <= 60 ? Math.floor(experience) : 0;

    let resumeKey = "";
    if (req.file) {
      const declared = req.file.mimetype;
      const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
      const magic = req.file.buffer.subarray(0, 4);
      const isPdf = magic[0] === 0x25 && magic[1] === 0x50 && magic[2] === 0x44 && magic[3] === 0x46;
      const isZip = magic[0] === 0x50 && magic[1] === 0x4b && magic[2] === 0x03 && magic[3] === 0x04;
      const isOle = magic[0] === 0xd0 && magic[1] === 0xcf;
      const magicOk = (declared === "application/pdf" && isPdf) || (declared === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && isZip) || (declared === "application/msword" && (isOle || isZip));
      if (!allowed.includes(declared) || !magicOk) {
        res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Resume must be a PDF or Word document under 5 MB"));
        return;
      }
      resumeKey = `resumes/${randomUUID()}`;
      await createStorage().putObject(resumeKey, req.file.buffer, declared);
    }

    let appId: string;
    try {
      appId = nextEventId();
    } catch (e) {
      if (e instanceof LeaseExpiredError) {
        res.status(503).json(errorEnvelope("ID_LEASE_UNAVAILABLE", "ID generation is paused. Try again shortly."));
        return;
      }
      throw e;
    }
    const claimClient = await catalogPool.connect();
    let candidateId: string;
    try {
      await claimClient.query("BEGIN");
      await assertCatalogOpen(claimClient);
      const claimed = await claimClient.query("INSERT INTO candidate_email_claims (email_norm, candidate_id) VALUES ($1, $2) ON CONFLICT (email_norm) DO NOTHING RETURNING candidate_id", [norm, `cand-${appId}`]);
      if (claimed.rows.length > 0) {
        candidateId = (claimed.rows[0] as { candidate_id: string }).candidate_id;
      } else {
        const existing = await claimClient.query("SELECT candidate_id FROM candidate_email_claims WHERE email_norm = $1", [norm]);
        candidateId = (existing.rows[0] as { candidate_id: string }).candidate_id;
      }
      await claimClient.query("COMMIT");
    } catch (e) {
      await claimClient.query("ROLLBACK");
      if (e instanceof CatalogGateError) {
        gateError(res);
        return;
      }
      throw e;
    } finally {
      claimClient.release();
    }
    const route = await candidatePool(candidateId);
    if (!route) {
      res.status(500).json(errorEnvelope("ROUTING_ERROR", "Candidate routing is unavailable"));
      return;
    }
    const existing = await route.pool.query("SELECT application_id, stage FROM applications WHERE candidate_id = $1 AND job_id = $2", [candidateId, req.params.jobId]);
    if (existing.rows.length > 0) {
      const st = (existing.rows[0] as { stage: string }).stage;
      if (st !== "WITHDRAWN") {
        res.status(409).json(errorEnvelope("DUPLICATE_APPLICATION", "You have already applied for this role"));
        return;
      }
      const reusedId = (existing.rows[0] as { application_id: string }).application_id;
      try {
        await fencedWrite(route.pool, async (c) => {
          await c.query("UPDATE applications SET stage = 'APPLIED', version = version + 1, updated_at = now() WHERE application_id = $1", [reusedId]);
        });
      } catch (e) {
        if (e instanceof GateClosedError) {
          res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
          return;
        }
        throw e;
      }
      res.json({ success: true, data: { applicationId: reusedId, reused: true } });
      return;
    }
    try {
      await fencedWrite(route.pool, async (c) => {
        await c.query(
          "INSERT INTO candidates (candidate_id, candidate_bucket_id, name, email, phone, skills, experience_years, resume_key, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'direct') ON CONFLICT (candidate_id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, skills = EXCLUDED.skills, experience_years = EXCLUDED.experience_years",
          [candidateId, route.bucket, name.trim(), norm, typeof phone === "string" ? phone.slice(0, 30) : "", skillList, expYears, resumeKey]
        );
        await c.query("INSERT INTO applications (application_id, candidate_id, candidate_bucket_id, job_id, stage) VALUES ($1,$2,$3,$4,'APPLIED')", [appId, candidateId, route.bucket, req.params.jobId]);
        await c.query("INSERT INTO application_stage_history (history_id, application_id, candidate_bucket_id, from_stage, to_stage, changed_by) VALUES ($1,$2,$3,'','APPLIED','candidate')", [`${appId}-h0`, appId, route.bucket]);
      });
    } catch (e) {
      if (e instanceof GateClosedError) {
        res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
        return;
      }
      throw e;
    }
    const statusToken = randomBytes(32).toString("hex");
    const indexClient = await catalogPool.connect();
    try {
      await indexClient.query("BEGIN");
      await assertCatalogOpen(indexClient);
      await indexClient.query("INSERT INTO application_index (application_id, candidate_id, job_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [appId, candidateId, req.params.jobId]);
      await indexClient.query("INSERT INTO app_status_tokens (token_hash, application_id, expires_at) VALUES ($1, $2, now() + interval '30 days')", [hashToken(statusToken), appId]);
      await indexClient.query("COMMIT");
    } catch (e) {
      await indexClient.query("ROLLBACK");
      if (e instanceof CatalogGateError) {
        gateError(res);
        return;
      }
      throw e;
    } finally {
      indexClient.release();
    }
    res.status(201).json({ success: true, data: { applicationId: appId, statusToken } });
  }
);

applicationsRouter.get("/application-status/:token", shortLinkLimit, async (req, res) => {
  const rows = await catalogPool.query("SELECT application_id, expires_at, revoked FROM app_status_tokens WHERE token_hash = $1", [hashToken(req.params.token)]);
  if (rows.rows.length === 0) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Unknown status link"));
    return;
  }
  const t = rows.rows[0] as { application_id: string; expires_at: string; revoked: boolean };
  if (t.revoked || new Date(t.expires_at) < new Date()) {
    res.status(410).json(errorEnvelope("STATUS_EXPIRED", "This status link expired"));
    return;
  }
  const idx = await catalogPool.query("SELECT job_id FROM application_index WHERE application_id = $1", [t.application_id]);
  const job = await catalogPool.query("SELECT title FROM jobs WHERE job_id = $1", [(idx.rows[0] as { job_id: string } | undefined)?.job_id ?? ""]);
  const route = await routeApplication(t.application_id);
  if (!route) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Application not found"));
    return;
  }
  const app = await route.pool.query("SELECT stage, applied_at, updated_at FROM applications WHERE application_id = $1", [t.application_id]);
  res.json({ success: true, data: { jobTitle: (job.rows[0] as { title: string } | undefined)?.title ?? "Role", ...(app.rows[0] as object) } });
});

applicationsRouter.get("/candidates", requireAuth, requireRoles("HR", "ADMIN"), async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const { map } = await loadMapByDomain(catalogPool, CANDIDATE_DOMAIN);
  const owned: Record<string, number[]> = {};
  for (const [bucket, shard] of map) {
    (owned[shard] ??= []).push(bucket);
  }
  const out: unknown[] = [];
  const unavailable: string[] = [];
  for (const { shard, pool } of ownedShardPools()) {
    try {
      const r = q
        ? await pool.query("SELECT candidate_id, name, email, source, created_at FROM candidates WHERE candidate_bucket_id = ANY($2) AND (name ILIKE $1 OR email LIKE $1) ORDER BY created_at DESC LIMIT 30", [`%${q}%`, owned[shard] ?? []])
        : await pool.query("SELECT candidate_id, name, email, source, created_at FROM candidates WHERE candidate_bucket_id = ANY($1) ORDER BY created_at DESC LIMIT 30", [owned[shard] ?? []]);
      out.push(...r.rows);
    } catch {
      unavailable.push(shard);
    }
  }
  res.json({ success: true, data: out, meta: partialMeta(unavailable) });
});

applicationsRouter.get("/candidates/:id", requireAuth, requireRoles("HR", "ADMIN"), async (req, res) => {
  const route = await candidatePool(req.params.id);
  if (!route) {
    res.status(500).json(errorEnvelope("ROUTING_ERROR", "Candidate routing is unavailable"));
    return;
  }
  const c = await route.pool.query("SELECT * FROM candidates WHERE candidate_id = $1", [req.params.id]);
  if (c.rows.length === 0) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Candidate not found"));
    return;
  }
  const apps = await route.pool.query("SELECT application_id, job_id, stage, version, applied_at FROM applications WHERE candidate_id = $1 ORDER BY applied_at DESC", [req.params.id]);
  res.json({ success: true, data: { candidate: c.rows[0], applications: apps.rows } });
});

applicationsRouter.get("/applications", requireAuth, requireRoles("HR", "ADMIN"), async (req, res) => {
  const jobId = typeof req.query.jobId === "string" ? req.query.jobId : null;
  const stage = typeof req.query.stage === "string" ? req.query.stage : null;
  const { map } = await loadMapByDomain(catalogPool, CANDIDATE_DOMAIN);
  const owned: Record<string, number[]> = {};
  for (const [bucket, shard] of map) {
    (owned[shard] ??= []).push(bucket);
  }
  const out: unknown[] = [];
  const unavailable: string[] = [];
  for (const { shard, pool } of ownedShardPools()) {
    try {
      const r = await pool.query(
        "SELECT a.*, c.name AS candidate_name FROM applications a JOIN candidates c ON c.candidate_id = a.candidate_id WHERE a.candidate_bucket_id = ANY($3) AND ($1::text IS NULL OR a.job_id = $1) AND ($2::text IS NULL OR a.stage = $2) ORDER BY a.applied_at DESC LIMIT 50",
        [jobId, stage, owned[shard] ?? []]
      );
      out.push(...r.rows);
    } catch {
      unavailable.push(shard);
    }
  }
  res.json({ success: true, data: out, meta: partialMeta(unavailable) });
});

applicationsRouter.get("/applications/:id", requireAuth, requireRoles("HR", "ADMIN"), async (req, res) => {
  const route = await routeApplication(req.params.id);
  if (!route) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Application not found"));
    return;
  }
  const app = await route.pool.query("SELECT * FROM applications WHERE application_id = $1", [req.params.id]);
  const hist = await route.pool.query("SELECT * FROM application_stage_history WHERE application_id = $1 ORDER BY timestamp", [req.params.id]);
  const iv = await route.pool.query("SELECT * FROM interviews WHERE application_id = $1 ORDER BY scheduled_at NULLS LAST", [req.params.id]);
  const ass = await route.pool.query("SELECT * FROM assessments WHERE application_id = $1", [req.params.id]);
  const cand = await route.pool.query("SELECT candidate_id, name, email, phone, skills, experience_years, source FROM candidates WHERE candidate_id = $1", [route.candidateId]);
  res.json({ success: true, data: { application: app.rows[0], candidate: cand.rows[0] ?? null, history: hist.rows, interviews: iv.rows, assessments: ass.rows } });
});

applicationsRouter.post("/applications/:id/stage", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const { to, version, notes } = req.body as { to?: string; version?: number; notes?: string };
  if (typeof to !== "string" || typeof version !== "number") {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Target stage and current version are required"));
    return;
  }
  const route = await routeApplication(req.params.id);
  if (!route) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Application not found"));
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
  try {
    const updated = await fencedWrite(route.pool, async (c) => {
      const cur = await c.query("SELECT stage, version FROM applications WHERE application_id = $1", [req.params.id]);
      if (cur.rows.length === 0) return null;
      const from = (cur.rows[0] as { stage: string }).stage;
      if ((cur.rows[0] as { version: number }).version !== version) throw new Error("VERSION_CONFLICT");
      if (!canTransition(from, to)) throw new Error("ILLEGAL_TRANSITION");
      await c.query("UPDATE applications SET stage = $2, version = version + 1, updated_at = now() WHERE application_id = $1", [req.params.id, to]);
      await c.query("INSERT INTO application_stage_history (history_id, application_id, candidate_bucket_id, from_stage, to_stage, changed_by, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
        `${eventId}-h`,
        req.params.id,
        route.bucket,
        from,
        to,
        req.userId ?? "",
        (notes ?? "").slice(0, 500),
      ]);
      await c.query("INSERT INTO candidate_outbox (event_id, candidate_id, candidate_bucket_id, type, payload) VALUES ($1,$2,$3,'AUDIT',$4)", [
        eventId,
        route.candidateId,
        route.bucket,
        JSON.stringify({ actor: req.userId ?? "", action: "application.stage", resource: `application:${req.params.id}`, from, to }),
      ]);
      return { from };
    });
    if (!updated) {
      res.status(404).json(errorEnvelope("NOT_FOUND", "Application not found"));
      return;
    }
    res.json({ success: true, data: { applicationId: req.params.id, stage: to } });
  } catch (e) {
    if ((e as Error).message === "VERSION_CONFLICT") {
      res.status(409).json(errorEnvelope("VERSION_CONFLICT", "This application changed. Reload and try again."));
      return;
    }
    if ((e as Error).message === "ILLEGAL_TRANSITION") {
      res.status(400).json(errorEnvelope("ILLEGAL_TRANSITION", "This stage change is not allowed"));
      return;
    }
    if (e instanceof GateClosedError) {
      res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
      return;
    }
    throw e;
  }
});

applicationsRouter.post("/applications/:id/interviews", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const { round, interviewer, scheduledAt } = req.body as { round?: string; interviewer?: string; scheduledAt?: string };
  if (typeof round !== "string" || round.trim().length === 0) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Interview round is required"));
    return;
  }
  const route = await routeApplication(req.params.id);
  if (!route) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Application not found"));
    return;
  }
  let id: string;
  try {
    id = nextEventId();
  } catch (e) {
    if (e instanceof LeaseExpiredError) {
      res.status(503).json(errorEnvelope("ID_LEASE_UNAVAILABLE", "ID generation is paused. Try again shortly."));
      return;
    }
    throw e;
  }
  try {
    await fencedWrite(route.pool, async (c) => {
      await c.query("INSERT INTO interviews (interview_id, application_id, candidate_bucket_id, round, interviewer, scheduled_at) VALUES ($1,$2,$3,$4,$5,$6)", [
        id,
        req.params.id,
        route.bucket,
        round,
        (interviewer as string) ?? "",
        (scheduledAt as string) ?? null,
      ]);
    });
  } catch (e) {
    if (e instanceof GateClosedError) {
      res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
      return;
    }
    throw e;
  }
  res.status(201).json({ success: true, data: { interviewId: id } });
});

applicationsRouter.post("/applications/:id/interviews/:interviewId", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const { status, feedback } = req.body as { status?: string; feedback?: string };
  if (status && !["SCHEDULED", "COMPLETED", "CANCELLED"].includes(status)) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Invalid interview status"));
    return;
  }
  const route = await routeApplication(req.params.id);
  if (!route) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Application not found"));
    return;
  }
  try {
    await fencedWrite(route.pool, async (c) => {
      await c.query("UPDATE interviews SET status = COALESCE($3, status), feedback = COALESCE($4, feedback) WHERE interview_id = $1 AND application_id = $2", [
        req.params.interviewId,
        req.params.id,
        status ?? null,
        (feedback as string) ?? null,
      ]);
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

applicationsRouter.post("/applications/:id/assessments", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const { type, score } = req.body as { type?: string; score?: string };
  if (typeof type !== "string" || type.trim().length === 0) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Assessment type is required"));
    return;
  }
  const route = await routeApplication(req.params.id);
  if (!route) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Application not found"));
    return;
  }
  let id: string;
  try {
    id = nextEventId();
  } catch (e) {
    if (e instanceof LeaseExpiredError) {
      res.status(503).json(errorEnvelope("ID_LEASE_UNAVAILABLE", "ID generation is paused. Try again shortly."));
      return;
    }
    throw e;
  }
  try {
    await fencedWrite(route.pool, async (c) => {
      await c.query("INSERT INTO assessments (assessment_id, application_id, candidate_bucket_id, type, score, status, completed_at) VALUES ($1,$2,$3,$4,$5,'COMPLETED',now())", [
        id,
        req.params.id,
        route.bucket,
        type,
        (score as string) ?? "",
      ]);
    });
  } catch (e) {
    if (e instanceof GateClosedError) {
      res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
      return;
    }
    throw e;
  }
  res.status(201).json({ success: true, data: { assessmentId: id } });
});

applicationsRouter.post("/applications/:id/convert", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const route = await routeApplication(req.params.id);
  if (!route) {
    res.status(404).json(errorEnvelope("NOT_FOUND", "Application not found"));
    return;
  }
  const app = await route.pool.query("SELECT stage, converted_invitation_id FROM applications WHERE application_id = $1", [req.params.id]);
  const row = app.rows[0] as { stage: string; converted_invitation_id: string | null };
  if (row.stage !== "SELECTED") {
    res.status(409).json(errorEnvelope("NOT_SELECTED", "Only selected candidates can be converted"));
    return;
  }
  if (row.converted_invitation_id) {
    res.json({ success: true, data: { invitationId: row.converted_invitation_id, reused: true } });
    return;
  }
  const cand = await route.pool.query("SELECT email, name FROM candidates WHERE candidate_id = $1", [route.candidateId]);
  const c = cand.rows[0] as { email: string; name: string };
  const token = randomBytes(32).toString("hex");
  const invitationId = randomUUID();
  const client = await catalogPool.connect();
  try {
    await client.query("BEGIN");
    await assertCatalogOpen(client);
    await client.query(
      "INSERT INTO invitations (invitation_id, email, email_norm, name, role, token_hash, status, expires_at, created_by) VALUES ($1,$2,$3,$4,'EMPLOYEE',$5,'INVITED', now() + interval '7 days', $6)",
      [invitationId, c.email, c.email.toLowerCase(), c.name, hashToken(token), req.userId ?? ""]
    );
    await writeAudit({ query: client.query.bind(client) }, { actor: req.userId ?? "", action: "candidate.converted", resource: `application:${req.params.id}`, metadata: { invitationId } });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    if (e instanceof CatalogGateError) {
      gateError(res);
      return;
    }
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "23505") {
      res.status(409).json(errorEnvelope("DUPLICATE_IDENTITY", "This email already has an account or invitation"));
      return;
    }
    throw e;
  } finally {
    client.release();
  }
  try {
    await fencedWrite(route.pool, async (c) => {
      await c.query("UPDATE applications SET converted_invitation_id = $2 WHERE application_id = $1", [req.params.id, invitationId]);
    });
  } catch (e) {
    if (e instanceof GateClosedError) {
      res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
      return;
    }
    throw e;
  }
  res.status(201).json({ success: true, data: { invitationId, token } });
});
