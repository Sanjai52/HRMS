import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { hashToken } from "../src/auth/sessions.js";

const base = process.env.API_BASE ?? "http://localhost:4000";
const mailpitBase = process.env.MAILPIT_BASE ?? "http://localhost:8025";
const catalogUrl = process.env.CATALOG_DATABASE_URL;
const describeIf = catalogUrl ? describe : describe.skip;
const mailLive = Boolean(process.env.MAIL_LIVE);

interface LoginResult {
  status: number;
  token?: string;
  csrf?: string;
  cookie?: string;
}

async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json().catch(() => null)) as { data?: { token: string; csrf: string } } | null;
  return {
    status: res.status,
    token: body?.data?.token,
    csrf: body?.data?.csrf,
    cookie: (res.headers.get("set-cookie") ?? "").split(";")[0],
  };
}

async function forgot(email: string): Promise<{ status: number; success: boolean }> {
  const res = await fetch(`${base}/api/v1/auth/forgot-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean } | null;
  return { status: res.status, success: body?.success === true };
}

async function reset(token: string, password: string): Promise<number> {
  const res = await fetch(`${base}/api/v1/auth/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  return res.status;
}

/** Poll Mailpit for the message to `email` and pull the 64-hex token out of the reset link. */
async function tokenFromMailpit(email: string): Promise<string> {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const search = await fetch(`${mailpitBase}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    if (search.ok) {
      const found = (await search.json()) as { messages?: Array<{ ID: string }> };
      const message = found.messages?.[0];
      if (message) {
        const detail = await fetch(`${mailpitBase}/api/v1/message/${message.ID}`);
        const full = (await detail.json()) as { Text?: string; HTML?: string };
        const match = `${full.Text ?? ""}\n${full.HTML ?? ""}`.match(/reset-password\?token=([0-9a-f]{64})/);
        if (match) return match[1];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`no password-reset mail for ${email} in Mailpit`);
}

describeIf("password recovery (forgot/reset)", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: catalogUrl });
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
  });

  async function createUser(): Promise<{ email: string; password: string; userId: string }> {
    const hr = await login("hr@hrms.local", "ChangeMe123!");
    expect(hr.status).toBe(200);
    const email = `pwreset${Date.now()}${Math.floor(Math.random() * 1000)}@hrms.local`;
    const password = "OrigPass123!";
    const invite = await fetch(`${base}/api/v1/auth/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr.token}` },
      body: JSON.stringify({ email, name: "Reset Subject", role: "EMPLOYEE" }),
    });
    expect(invite.status).toBe(201);
    const { data } = (await invite.json()) as { data: { token: string } };
    const accept = await fetch(`${base}/api/v1/auth/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: data.token, password }),
    });
    expect(accept.status).toBe(201);
    const u = await pool.query("SELECT user_id FROM users WHERE email_norm = $1", [email]);
    expect(u.rows.length).toBe(1);
    return { email, password, userId: (u.rows[0] as { user_id: string }).user_id };
  }

  it("unknown email still returns 200 and stores nothing", async () => {
    const ghost = `ghost${Date.now()}@hrms.local`;
    const r = await forgot(ghost);
    expect(r.status).toBe(200);
    expect(r.success).toBe(true);
    const rows = await pool.query(
      "SELECT count(*)::int AS c FROM password_resets pr JOIN users u ON u.user_id = pr.user_id WHERE u.email_norm = $1",
      [ghost]
    );
    expect((rows.rows[0] as { c: number }).c).toBe(0);
  });

  it("known email stores one PENDING 30-minute token and e-mails the link (Mailpit)", async () => {
    const u = await createUser();
    const r = await forgot(u.email);
    expect(r.status).toBe(200);
    expect(r.success).toBe(true);

    const rows = await pool.query("SELECT reset_id, token_hash, status, expires_at FROM password_resets WHERE user_id = $1", [u.userId]);
    expect(rows.rows.length).toBe(1);
    const row = rows.rows[0] as { reset_id: string; token_hash: string; status: string; expires_at: string };
    expect(row.status).toBe("PENDING");
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    const remainingMs = new Date(row.expires_at).getTime() - Date.now();
    expect(remainingMs).toBeGreaterThan(25 * 60 * 1000);
    expect(remainingMs).toBeLessThanOrEqual(31 * 60 * 1000);

    const audit = await pool.query("SELECT count(*)::int AS c FROM audit_logs WHERE actor = $1 AND action = 'password.reset_requested'", [u.userId]);
    expect((audit.rows[0] as { c: number }).c).toBe(1);

    if (!mailLive) return;
    const token = await tokenFromMailpit(u.email);
    expect(hashToken(token)).toBe(row.token_hash);
  }, 30000);

  it("reset swaps the password, burns the token and revokes the user's sessions", async () => {
    const u = await createUser();
    const before = await login(u.email, u.password);
    expect(before.status).toBe(200);

    expect((await forgot(u.email)).status).toBe(200);
    const pending = await pool.query("SELECT reset_id, token_hash FROM password_resets WHERE user_id = $1 AND status = 'PENDING'", [
      u.userId,
    ]);
    expect(pending.rows.length).toBe(1);
    const pendingRow = pending.rows[0] as { reset_id: string; token_hash: string };

    // The raw token only ever exists in the reset e-mail. With Mailpit live we
    // read it back end-to-end; without it we seed the same hash the endpoint
    // would have stored so the token lifecycle stays testable.
    let token: string;
    if (mailLive) {
      token = await tokenFromMailpit(u.email);
      expect(hashToken(token)).toBe(pendingRow.token_hash);
    } else {
      token = randomBytes(32).toString("hex");
      await pool.query("UPDATE password_resets SET token_hash = $1 WHERE reset_id = $2", [hashToken(token), pendingRow.reset_id]);
    }

    expect(await reset(token, "FreshPass456!")).toBe(200);

    expect((await login(u.email, u.password)).status).toBe(401);
    expect((await login(u.email, "FreshPass456!")).status).toBe(200);
    const refresh = await fetch(`${base}/api/v1/auth/refresh`, { method: "POST", headers: { cookie: before.cookie ?? "" } });
    expect(refresh.status).toBe(401);

    const used = await pool.query("SELECT status, used_at FROM password_resets WHERE reset_id = $1", [pendingRow.reset_id]);
    expect((used.rows[0] as { status: string; used_at: string | null }).status).toBe("USED");
    expect((used.rows[0] as { used_at: string | null }).used_at).not.toBeNull();

    const audit = await pool.query("SELECT count(*)::int AS c FROM audit_logs WHERE actor = $1 AND action = 'password.reset'", [u.userId]);
    expect((audit.rows[0] as { c: number }).c).toBe(1);

    expect(await reset(token, "ReusePass789!")).toBe(410);
  }, 40000);

  it("expired and unknown tokens are rejected with 410; short passwords with 400", async () => {
    const u = await createUser();
    const expiredToken = randomBytes(32).toString("hex");
    await pool.query(
      "INSERT INTO password_resets (reset_id, user_id, token_hash, status, expires_at) VALUES ($1, $2, $3, 'PENDING', now() - interval '1 minute')",
      [randomUUID(), u.userId, hashToken(expiredToken)]
    );
    expect(await reset(expiredToken, "AfterExpiry123!")).toBe(410);
    expect(await reset(randomBytes(32).toString("hex"), "WhateverPass123!")).toBe(410);
    expect(await reset(expiredToken, "short")).toBe(400);
  }, 30000);

  it("the 11th forgot-password call in a minute is rate limited", async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
    for (let i = 0; i < 10; i++) {
      expect((await forgot(`burst${i}-${Date.now()}@hrms.local`)).status).toBe(200);
    }
    expect((await forgot(`burst11-${Date.now()}@hrms.local`)).status).toBe(429);
  }, 30000);
});
