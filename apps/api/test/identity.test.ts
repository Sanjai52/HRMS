import { describe, it, expect, beforeAll } from "vitest";

const base = process.env.API_BASE ?? "http://localhost:4000";

async function login(): Promise<{ token: string; csrf: string; cookie: string }> {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "hr@hrms.local", password: "ChangeMe123!" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { data: { token: string; csrf: string } };
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  expect(cookie).toMatch(/^hrms_refresh=/);
  return { token: body.data.token, csrf: body.data.csrf, cookie };
}

describe("Phase 2 identity", () => {
  beforeAll(async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
  });
  it("login sets a refresh cookie; refresh rotates; reuse of the old cookie is rejected", async () => {
    const s = await login();
    const r1 = await fetch(`${base}/api/v1/auth/refresh`, { method: "POST", headers: { cookie: s.cookie } });
    expect(r1.status).toBe(200);
    const fresh = (r1.headers.get("set-cookie") ?? "").split(";")[0];
    expect(fresh).not.toBe(s.cookie);
    const r2 = await fetch(`${base}/api/v1/auth/refresh`, { method: "POST", headers: { cookie: s.cookie } });
    expect(r2.status).toBe(401);
  });

  it("logout requires the CSRF header and clears the session", async () => {
    const s = await login();
    const bad = await fetch(`${base}/api/v1/auth/logout`, { method: "POST", headers: { cookie: s.cookie, "x-csrf-token": "wrong" } });
    expect(bad.status).toBe(403);
    const ok = await fetch(`${base}/api/v1/auth/logout`, { method: "POST", headers: { cookie: s.cookie, "x-csrf-token": s.csrf } });
    expect(ok.status).toBe(200);
    const again = await fetch(`${base}/api/v1/auth/refresh`, { method: "POST", headers: { cookie: s.cookie } });
    expect(again.status).toBe(401);
  });

  it("HR creates an invitation; invitee accepts; duplicate invite is rejected; audit rows exist", async () => {
    const s = await login();
    const email = `newbie${Date.now()}@hrms.local`;
    const create = await fetch(`${base}/api/v1/auth/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${s.token}` },
      body: JSON.stringify({ email, name: "New Joiner", role: "EMPLOYEE" }),
    });
    expect(create.status).toBe(201);
    const { data } = (await create.json()) as { data: { invitationId: string; token: string } };

    const dup = await fetch(`${base}/api/v1/auth/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${s.token}` },
      body: JSON.stringify({ email, name: "Someone Else" }),
    });
    expect(dup.status).toBe(409);

    const accept = await fetch(`${base}/api/v1/auth/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: data.token, password: "JoinerPass1!" }),
    });
    expect(accept.status).toBe(201);

    const reuse = await fetch(`${base}/api/v1/auth/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: data.token, password: "JoinerPass1!" }),
    });
    expect(reuse.status).toBe(410);

    const auditDeniedForHr = await fetch(`${base}/api/v1/admin/audit-logs?action=invitation.created&limit=5`, {
      headers: { authorization: `Bearer ${s.token}` },
    });
    expect(auditDeniedForHr.status).toBe(403);

    const adminInvite = await fetch(`${base}/api/v1/auth/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${s.token}` },
      body: JSON.stringify({ email: `chief${Date.now()}@hrms.local`, role: "ADMIN" }),
    });
    expect(adminInvite.status).toBe(201);
    const adminBody = (await adminInvite.json()) as { data: { token: string } };
    const adminAccept = await fetch(`${base}/api/v1/auth/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: adminBody.data.token, password: "ChiefPass1!" }),
    });
    const admin = (await adminAccept.json()) as { data: { token: string } };
    const audit = await fetch(`${base}/api/v1/admin/audit-logs?action=invitation.created&limit=5`, {
      headers: { authorization: `Bearer ${admin.data.token}` },
    });
    expect(audit.status).toBe(200);
    const auditBody = (await audit.json()) as { data: unknown[] };
    expect(auditBody.data.length).toBeGreaterThan(0);
  });

  it("RBAC: a non-privileged token cannot create invitations or read audit logs", async () => {
    const s = await login();
    const email = `pleb${Date.now()}@hrms.local`;
    const create = await fetch(`${base}/api/v1/auth/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${s.token}` },
      body: JSON.stringify({ email }),
    });
    expect(create.status).toBe(201);
    const { data } = (await create.json()) as { data: { token: string } };
    const accept = await fetch(`${base}/api/v1/auth/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: data.token, password: "PlebPass12!" }),
    });
    const pleb = (await accept.json()) as { data: { token: string } };
    const denied = await fetch(`${base}/api/v1/auth/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${pleb.data.token}` },
      body: JSON.stringify({ email: `x${Date.now()}@hrms.local` }),
    });
    expect(denied.status).toBe(403);
    const auditDenied = await fetch(`${base}/api/v1/admin/audit-logs`, {
      headers: { authorization: `Bearer ${pleb.data.token}` },
    });
    expect(auditDenied.status).toBe(403);
  });

  it("invitation for an existing account email is rejected", async () => {
    const s = await login();
    const dup = await fetch(`${base}/api/v1/auth/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${s.token}` },
      body: JSON.stringify({ email: "hr@hrms.local" }),
    });
    expect(dup.status).toBe(409);
  });

  it("rate limiter rejects sustained login bursts with 429", async () => {
    let limited = false;
    for (let i = 0; i < 60; i++) {
      const r = await fetch(`${base}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "nobody@hrms.local", password: "wrongwrong" }),
      });
      if (r.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});
