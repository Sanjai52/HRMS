import { Router } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { errorEnvelope } from "@hrms/core";
import { catalogPool } from "../db/pools.js";
import { verifyPassword, hashPassword } from "../auth/password.js";
import { signAccessToken } from "../auth/token.js";
import { createSession, getSession, rotateSession, destroySession, destroyUserSessions, hashToken } from "../auth/sessions.js";
import { emailProvider } from "../email.js";
import { writeAudit } from "../audit/audit.js";
import { assertCatalogOpen, CatalogGateError, gateError } from "../catalog-gate.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";
import { loginLimit, recoverLimit } from "../middleware/rate-limit.js";

export const authRouter = Router();

const REFRESH_COOKIE = "hrms_refresh";
const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/api/v1/auth",
  secure: (process.env.APP_ENV ?? "development") === "production",
  maxAge: 7 * 24 * 3600 * 1000,
};

authRouter.post("/login", loginLimit, async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Email and password are required"));
    return;
  }
  const norm = email.trim().toLowerCase();
  const u = await catalogPool.query("SELECT user_id, password_hash, status FROM users WHERE email_norm = $1", [norm]);
  if (u.rows.length === 0 || u.rows[0].status !== "ACTIVE") {
    res.status(401).json(errorEnvelope("INVALID_CREDENTIALS", "Invalid email or password"));
    return;
  }
  const ok = await verifyPassword(u.rows[0].password_hash as string, password);
  if (!ok) {
    res.status(401).json(errorEnvelope("INVALID_CREDENTIALS", "Invalid email or password"));
    return;
  }
  const r = await catalogPool.query("SELECT role FROM user_roles WHERE user_id = $1", [u.rows[0].user_id]);
  const roles = (r.rows as Array<{ role: string }>).map((row) => row.role);
  const session = await createSession(u.rows[0].user_id as string);
  const { token, expiresIn } = signAccessToken({ userId: u.rows[0].user_id as string, roles });
  res.cookie(REFRESH_COOKIE, session.sessionId, cookieOpts);
  res.json({ success: true, data: { token, expiresIn, roles, csrf: session.csrf } });
});

authRouter.post("/refresh", async (req, res) => {
  const oldId = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!oldId) {
    res.status(401).json(errorEnvelope("UNAUTHENTICATED", "No session. Log in again."));
    return;
  }
  const rotated = await rotateSession(oldId);
  if (!rotated) {
    res.status(401).json(errorEnvelope("UNAUTHENTICATED", "Session expired. Log in again."));
    return;
  }
  const record = await getSession(rotated.sessionId);
  if (!record) {
    res.status(401).json(errorEnvelope("UNAUTHENTICATED", "Session expired. Log in again."));
    return;
  }
  const r = await catalogPool.query("SELECT role FROM user_roles WHERE user_id = $1", [record.userId]);
  const roles = (r.rows as Array<{ role: string }>).map((row) => row.role);
  const { token, expiresIn } = signAccessToken({ userId: record.userId, roles });
  res.cookie(REFRESH_COOKIE, rotated.sessionId, cookieOpts);
  res.json({ success: true, data: { token, expiresIn, roles, csrf: rotated.csrf } });
});

authRouter.post("/logout", async (req, res) => {
  const csrf = req.headers["x-csrf-token"] as string | undefined;
  const sessionId = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (sessionId) {
    const record = await getSession(sessionId);
    if (record && record.csrf !== csrf) {
      res.status(403).json(errorEnvelope("FORBIDDEN", "Security check failed. Try again."));
      return;
    }
    await destroySession(sessionId);
  }
  res.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
  res.json({ success: true, data: null });
});

authRouter.post("/invitations", requireAuth, requireRoles("HR", "ADMIN"), async (req: AuthedRequest, res) => {
  const { email, name, role } = req.body as { email?: string; name?: string; role?: string };
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "A valid email address is required"));
    return;
  }
  const allowedRole = role === "MANAGER" || role === "HR" || role === "ADMIN" ? role : "EMPLOYEE";
  const norm = email.trim().toLowerCase();
  const token = randomBytes(32).toString("hex");
  const client = await catalogPool.connect();
  try {
    await client.query("BEGIN");
    await assertCatalogOpen(client);
    const existing = await client.query("SELECT 1 FROM users WHERE email_norm = $1", [norm]);
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      res.status(409).json(errorEnvelope("DUPLICATE_IDENTITY", "An account with this email already exists"));
      return;
    }
    const id = randomUUID();
    await client.query(
      "INSERT INTO invitations (invitation_id, email, email_norm, name, role, token_hash, status, expires_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, 'INVITED', now() + interval '7 days', $7)",
      [id, email.trim(), norm, (name ?? "").trim(), allowedRole, hashToken(token), req.userId ?? ""]
    );
    await writeAudit(
      { query: client.query.bind(client) },
      { actor: req.userId ?? "", action: "invitation.created", resource: `invitation:${id}`, metadata: { email: norm, role: allowedRole } }
    );
    await client.query("COMMIT");
    res.status(201).json({ success: true, data: { invitationId: id, token } });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e instanceof CatalogGateError) {
      gateError(res);
      return;
    }
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "23505") {
      res.status(409).json(errorEnvelope("DUPLICATE_IDENTITY", "An invitation for this email is already open"));
      return;
    }
    throw e;
  } finally {
    client.release();
  }
});

authRouter.get("/invitations", requireAuth, requireRoles("HR", "ADMIN"), async (_req, res) => {
  const rows = await catalogPool.query(
    "SELECT invitation_id, email, name, role, status, created_at, expires_at FROM invitations ORDER BY created_at DESC LIMIT 100"
  );
  res.json({ success: true, data: rows.rows });
});

authRouter.post("/accept", loginLimit, async (req, res) => {  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password || password.length < 8) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "A valid invitation token and a password of 8+ characters are required"));
    return;
  }
  const client = await catalogPool.connect();
  try {
    await client.query("BEGIN");
    await assertCatalogOpen(client);
    const inv = await client.query("SELECT * FROM invitations WHERE token_hash = $1 FOR UPDATE", [hashToken(token)]);
    if (inv.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json(errorEnvelope("NOT_FOUND", "This invitation link is invalid"));
      return;
    }
    const row = inv.rows[0] as { invitation_id: string; email: string; email_norm: string; role: string; status: string; expires_at: string };
    if (row.status !== "INVITED" || new Date(row.expires_at) < new Date()) {
      await client.query("UPDATE invitations SET status = 'EXPIRED' WHERE invitation_id = $1", [row.invitation_id]);
      await client.query("COMMIT");
      res.status(410).json(errorEnvelope("INVITATION_EXPIRED", "This invitation has expired. Ask HR for a new one."));
      return;
    }
    const userId = randomUUID();
    const pwHash = await hashPassword(password);
    await client.query("INSERT INTO users (user_id, email, email_norm, password_hash, status) VALUES ($1, $2, $3, $4, 'ACTIVE')", [
      userId,
      row.email,
      row.email_norm,
      pwHash,
    ]);
    await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2)", [userId, row.role]);
    await client.query("UPDATE invitations SET status = 'RESERVED' WHERE invitation_id = $1", [row.invitation_id]);
    await writeAudit(
      { query: client.query.bind(client) },
      { actor: userId, action: "invitation.accepted", resource: `invitation:${row.invitation_id}`, metadata: { email: row.email_norm } }
    );
    await client.query("COMMIT");
    const session = await createSession(userId);
    const signed = signAccessToken({ userId, roles: [row.role] });
    res.cookie(REFRESH_COOKIE, session.sessionId, cookieOpts);
    res.status(201).json({ success: true, data: { token: signed.token, expiresIn: signed.expiresIn, roles: [row.role], csrf: session.csrf } });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e instanceof CatalogGateError) {
      gateError(res);
      return;
    }
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "23505") {
      res.status(409).json(errorEnvelope("DUPLICATE_IDENTITY", "An account with this email already exists"));
      return;
    }
    throw e;
  } finally {
    client.release();
  }
});

authRouter.post("/forgot-password", recoverLimit, async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "A valid email address is required"));
    return;
  }
  const norm = email.trim().toLowerCase();
  const u = await catalogPool.query("SELECT user_id, email FROM users WHERE email_norm = $1", [norm]);
  if (u.rows.length > 0) {
    const userId = u.rows[0].user_id as string;
    const token = randomBytes(32).toString("hex");
    const client = await catalogPool.connect();
    try {
      await client.query("BEGIN");
      await assertCatalogOpen(client);
      await client.query("UPDATE password_resets SET status = 'EXPIRED' WHERE user_id = $1 AND status = 'PENDING'", [userId]);
      await client.query(
        "INSERT INTO password_resets (reset_id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '30 minutes')",
        [randomUUID(), userId, hashToken(token)]
      );
      await writeAudit(
        { query: client.query.bind(client) },
        { actor: userId, action: "password.reset_requested", resource: `user:${userId}` }
      );
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
    await emailProvider().send({
      to: u.rows[0].email as string,
      subject: "Reset your HRMS password",
      text: `A password reset was requested for your HRMS account. Open this link within 30 minutes to choose a new password:\n\nhttp://localhost:3000/reset-password?token=${token}\n\nIf you did not request this, you can ignore this message.`,
    });
  }
  // Always the same response, so the endpoint cannot be used to enumerate accounts.
  res.json({ success: true, data: null });
});

authRouter.post("/reset-password", recoverLimit, async (req, res) => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password || password.length < 8) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "A reset token and a password of 8+ characters are required"));
    return;
  }
  let userId: string | undefined;
  const client = await catalogPool.connect();
  try {
    await client.query("BEGIN");
    await assertCatalogOpen(client);
    const r = await client.query("SELECT reset_id, user_id, status, expires_at FROM password_resets WHERE token_hash = $1 FOR UPDATE", [
      hashToken(token),
    ]);
    if (r.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(410).json(errorEnvelope("TOKEN_INVALID", "This reset link is invalid or has expired. Request a new one."));
      return;
    }
    const row = r.rows[0] as { reset_id: string; user_id: string; status: string; expires_at: string };
    if (row.status !== "PENDING" || new Date(row.expires_at) < new Date()) {
      await client.query("UPDATE password_resets SET status = 'EXPIRED' WHERE reset_id = $1 AND status = 'PENDING'", [row.reset_id]);
      await client.query("COMMIT");
      res.status(410).json(errorEnvelope("TOKEN_INVALID", "This reset link is invalid or has expired. Request a new one."));
      return;
    }
    const pwHash = await hashPassword(password);
    await client.query("UPDATE users SET password_hash = $1 WHERE user_id = $2", [pwHash, row.user_id]);
    await client.query("UPDATE password_resets SET status = 'USED', used_at = now() WHERE reset_id = $1", [row.reset_id]);
    await writeAudit(
      { query: client.query.bind(client) },
      { actor: row.user_id, action: "password.reset", resource: `user:${row.user_id}` }
    );
    await client.query("COMMIT");
    userId = row.user_id;
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
  if (userId) await destroyUserSessions(userId);
  res.json({ success: true, data: null });
});
