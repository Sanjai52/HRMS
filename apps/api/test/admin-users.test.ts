import { describe, it, expect, beforeAll } from "vitest";
import { Pool } from "pg";

const base = process.env.API_BASE ?? "http://localhost:4000";
const catalogUrl = process.env.CATALOG_DATABASE_URL;
const tag = Date.now();

async function auditCount(action: string, resource: string): Promise<number> {
  if (!catalogUrl) return -1;
  const pool = new Pool({ connectionString: catalogUrl });
  try {
    const r = await pool.query("SELECT count(*)::int AS c FROM audit_logs WHERE action = $1 AND resource = $2", [action, resource]);
    return (r.rows[0] as { c: number }).c;
  } finally {
    await pool.end();
  }
}

async function hrLogin(): Promise<string> {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "hr@hrms.local", password: "ChangeMe123!" }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { token: string } }).data.token;
}

async function adminToken(hr: string): Promise<{ token: string; email: string }> {
  const email = `userboss${tag}${Math.floor(Math.random() * 1000)}@hrms.local`;
  const create = await fetch(`${base}/api/v1/auth/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
    body: JSON.stringify({ email, role: "ADMIN" }),
  });
  expect(create.status).toBe(201);
  const { data } = (await create.json()) as { data: { token: string } };
  const accept = await fetch(`${base}/api/v1/auth/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: data.token, password: "UserBossPass1!" }),
  });
  expect(accept.status).toBe(201);
  return { token: ((await accept.json()) as { data: { token: string } }).data.token, email };
}

async function makeUser(hr: string, name: string): Promise<{ email: string; password: string; cookie: string }> {
  const email = `${name.replace(/[^a-z]/gi, "").toLowerCase()}${tag}${Math.floor(Math.random() * 1000)}@hrms.local`;
  const password = "FreshUser1!";
  const create = await fetch(`${base}/api/v1/auth/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
    body: JSON.stringify({ email, name, role: "EMPLOYEE" }),
  });
  expect(create.status).toBe(201);
  const { data } = (await create.json()) as { data: { token: string } };
  const accept = await fetch(`${base}/api/v1/auth/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: data.token, password }),
  });
  expect(accept.status).toBe(201);
  const login = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(login.status).toBe(200);
  const cookie = (login.headers.get("set-cookie") ?? "").match(/hrms_refresh=[^;]+/)?.[0] ?? "";
  expect(cookie).not.toBe("");
  return { email, password, cookie };
}

interface UserRow {
  user_id: string;
  email: string;
  status: string;
  is_active: boolean;
  employee_id: string | null;
  roles: string[];
}

async function listUsers(token: string): Promise<{ users: UserRow[]; total: number; roleCounts: Record<string, number>; limit: number; offset: number }> {
  const res = await fetch(`${base}/api/v1/admin/users?limit=100`, { headers: { authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { users: UserRow[]; total: number; roleCounts: Record<string, number>; limit: number; offset: number } }).data;
}

async function findUser(token: string, email: string): Promise<UserRow> {
  const data = await listUsers(token);
  const row = data.users.find((u) => u.email === email);
  expect(row).toBeDefined();
  return row!;
}

describe("Phase 10b admin users & roles", () => {
  beforeAll(async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
  });

  it("list requires ADMIN and joins users with roles, is_active and employee_id", async () => {
    const hr = await hrLogin();
    const denied = await fetch(`${base}/api/v1/admin/users`, { headers: { authorization: `Bearer ${hr}` } });
    expect(denied.status).toBe(403);

    const adm = await adminToken(hr);
    const fresh = await makeUser(hr, "Shape User");
    const data = await listUsers(adm.token);
    expect(data.total).toBeGreaterThan(0);
    expect(data.limit).toBe(100);
    expect(data.offset).toBe(0);
    expect(data.roleCounts.EMPLOYEE).toBeGreaterThan(0);
    const row = data.users.find((u) => u.email === fresh.email);
    expect(row).toBeDefined();
    expect(row!.roles).toEqual(["EMPLOYEE"]);
    expect(row!.is_active).toBe(true);
    expect(row!.employee_id).toBeNull();
  });

  it("role change persists, is audited, and self-edit is refused", async () => {
    const hr = await hrLogin();
    const adm = await adminToken(hr);
    const target = await makeUser(hr, "Role Target");
    const userId = (await findUser(adm.token, target.email)).user_id;

    const change = await fetch(`${base}/api/v1/admin/users/${userId}/roles`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${adm.token}` },
      body: JSON.stringify({ roles: ["MANAGER", "EMPLOYEE"] }),
    });
    expect(change.status).toBe(200);
    const changed = (await change.json()) as { data: { roles: string[] } };
    expect(changed.data.roles.sort()).toEqual(["EMPLOYEE", "MANAGER"]);

    const after = await findUser(adm.token, target.email);
    expect(after.roles).toEqual(["EMPLOYEE", "MANAGER"]);
    const relogin = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: target.email, password: target.password }),
    });
    expect(relogin.status).toBe(200);
    expect(((await relogin.json()) as { data: { roles: string[] } }).data.roles).toContain("MANAGER");
    if (catalogUrl) expect(await auditCount("admin.roles_changed", `user:${userId}`)).toBeGreaterThan(0);

    const badRole = await fetch(`${base}/api/v1/admin/users/${userId}/roles`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${adm.token}` },
      body: JSON.stringify({ roles: ["SUPERUSER"] }),
    });
    expect(badRole.status).toBe(400);

    const missing = await fetch(`${base}/api/v1/admin/users/00000000-0000-0000-0000-000000000000/roles`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${adm.token}` },
      body: JSON.stringify({ roles: ["EMPLOYEE"] }),
    });
    expect(missing.status).toBe(404);

    const selfId = (await findUser(adm.token, adm.email)).user_id;
    const selfEdit = await fetch(`${base}/api/v1/admin/users/${selfId}/roles`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${adm.token}` },
      body: JSON.stringify({ roles: ["EMPLOYEE"] }),
    });
    expect(selfEdit.status).toBe(400);
    expect(((await selfEdit.json()) as { error: { code: string } }).error.code).toBe("SELF_EDIT");
  });

  it("deactivation blocks login, revokes sessions and is audited", async () => {
    const hr = await hrLogin();
    const adm = await adminToken(hr);
    const target = await makeUser(hr, "Doomed User");
    const userId = (await findUser(adm.token, target.email)).user_id;

    const rotate = await fetch(`${base}/api/v1/auth/refresh`, { method: "POST", headers: { cookie: target.cookie } });
    expect(rotate.status).toBe(200);
    const liveCookie = (rotate.headers.get("set-cookie") ?? "").match(/hrms_refresh=[^;]+/)?.[0] ?? "";
    expect(liveCookie).not.toBe("");

    const deact = await fetch(`${base}/api/v1/admin/users/${userId}/deactivate`, {
      method: "POST",
      headers: { authorization: `Bearer ${adm.token}` },
    });
    expect(deact.status).toBe(200);
    expect(((await deact.json()) as { data: { is_active: boolean } }).data.is_active).toBe(false);

    const deadSession = await fetch(`${base}/api/v1/auth/refresh`, { method: "POST", headers: { cookie: liveCookie } });
    expect(deadSession.status).toBe(401);
    const relogin = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: target.email, password: target.password }),
    });
    expect(relogin.status).toBe(401);

    const after = await findUser(adm.token, target.email);
    expect(after.is_active).toBe(false);
    expect(after.status).toBe("DEACTIVATED");
    if (catalogUrl) expect(await auditCount("admin.user_deactivated", `user:${userId}`)).toBeGreaterThan(0);
  });

  it("HR is refused and mutations return 503 while the catalog gate is closed", async () => {
    const hr = await hrLogin();
    const adm = await adminToken(hr);
    const target = await makeUser(hr, "Gate User");
    const userId = (await findUser(adm.token, target.email)).user_id;

    const hrPatch = await fetch(`${base}/api/v1/admin/users/${userId}/roles`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ roles: ["EMPLOYEE"] }),
    });
    expect(hrPatch.status).toBe(403);
    const hrDeact = await fetch(`${base}/api/v1/admin/users/${userId}/deactivate`, {
      method: "POST",
      headers: { authorization: `Bearer ${hr}` },
    });
    expect(hrDeact.status).toBe(403);

    if (!catalogUrl) return;
    const catalog = new Pool({ connectionString: catalogUrl });
    try {
      await catalog.query("UPDATE catalog_write_gate SET state = 'GATED', epoch = $1, updated_at = now() WHERE id = 1", [Date.now()]);
      const patch = await fetch(`${base}/api/v1/admin/users/${userId}/roles`, {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${adm.token}` },
        body: JSON.stringify({ roles: ["MANAGER"] }),
      });
      expect(patch.status).toBe(503);
      expect(((await patch.json()) as { error: { code: string } }).error.code).toBe("GATE_CLOSED");
      const deact = await fetch(`${base}/api/v1/admin/users/${userId}/deactivate`, {
        method: "POST",
        headers: { authorization: `Bearer ${adm.token}` },
      });
      expect(deact.status).toBe(503);
      expect(((await deact.json()) as { error: { code: string } }).error.code).toBe("GATE_CLOSED");
    } finally {
      await catalog.query("UPDATE catalog_write_gate SET state = 'OPEN', updated_at = now() WHERE id = 1");
      await catalog.end();
    }
    const stillActive = await findUser(adm.token, target.email);
    expect(stillActive.roles).toEqual(["EMPLOYEE"]);
  }, 60000);
});
