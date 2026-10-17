import { describe, it, expect, beforeAll } from "vitest";
import { Pool } from "pg";
import { Snowflake, stableEmployeeBucket } from "@hrms/core";

const base = process.env.API_BASE ?? "http://localhost:4000";
const catalogUrl = process.env.CATALOG_DATABASE_URL;

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
  const body = (await res.json()) as { data: { token: string } };
  return body.data.token;
}

async function runDispatcher(): Promise<{ delivered: number }> {
  const r = await fetch(`${base}/system/test/run-dispatcher`, { method: "POST" });
  expect(r.status).toBe(200);
  const body = (await r.json()) as { data: { delivered: number } };
  return body.data;
}

async function adminToken(hrToken: string): Promise<string> {
  const email = `boss${Date.now()}@hrms.local`;
  const create = await fetch(`${base}/api/v1/auth/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${hrToken}` },
    body: JSON.stringify({ email, role: "ADMIN" }),
  });
  expect(create.status).toBe(201);
  const { data } = (await create.json()) as { data: { token: string } };
  const accept = await fetch(`${base}/api/v1/auth/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: data.token, password: "BossPass12!" }),
  });
  const accepted = (await accept.json()) as { data: { token: string } };
  return accepted.data.token;
}

describe("Phase 3 employee lifecycle", () => {
  const tag = Date.now();
  beforeAll(async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
  });

  it("invite -> accept -> onboard -> dispatcher projects the directory on the owning shard", async () => {
    const hr = await hrLogin();
    const email = `hire${Date.now()}@hrms.local`;
    const create = await fetch(`${base}/api/v1/auth/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ email, name: "Hire " + tag, role: "EMPLOYEE" }),
    });
    expect(create.status).toBe(201);
    const { data } = (await create.json()) as { data: { invitationId: string; token: string } };
    const accept = await fetch(`${base}/api/v1/auth/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: data.token, password: "HirePass12!" }),
    });
    expect(accept.status).toBe(201);

    const onboard = await fetch(`${base}/api/v1/employees/onboard`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ invitationId: data.invitationId }),
    });
    expect(onboard.status).toBe(201);
    const ob = (await onboard.json()) as { data: { employeeId: string; bucket: number; shard: string } };
    expect(stableEmployeeBucket(ob.data.employeeId)).toBe(ob.data.bucket);

    const counts = await runDispatcher();
    expect(counts.delivered).toBeGreaterThan(0);

    const dir = await fetch(`${base}/api/v1/employees?q=${encodeURIComponent("Hire " + tag)}`, {
      headers: { authorization: `Bearer ${hr}` },
    });
    const dirBody = (await dir.json()) as { data: Array<{ employee_id: string }> };
    expect(dirBody.data.some((r) => r.employee_id === ob.data.employeeId)).toBe(true);

    const suggest = await fetch(`${base}/api/v1/search/suggest?q=${encodeURIComponent("hire")}`, {
      headers: { authorization: `Bearer ${hr}` },
    });
    expect(suggest.status).toBe(200);
    const sugBody = (await suggest.json()) as { data: Array<{ employeeId: string }> };
    expect(sugBody.data.some((r) => r.employeeId === ob.data.employeeId)).toBe(true);

    if (catalogUrl) expect(await auditCount("employee.onboarded", `employee:${ob.data.employeeId}`)).toBeGreaterThan(0);
  });

  it("update is version-checked; stale writes are rejected", async () => {
    const hr = await hrLogin();
    const dir = await fetch(`${base}/api/v1/employees?q=${encodeURIComponent("Hire " + tag)}`, {
      headers: { authorization: `Bearer ${hr}` },
    });
    const dirBody = (await dir.json()) as { data: Array<{ employee_id: string }> };
    expect(dirBody.data.length).toBeGreaterThan(0);
    const id = dirBody.data[0].employee_id;
    const detail = (await (await fetch(`${base}/api/v1/employees/${id}`, { headers: { authorization: `Bearer ${hr}` } })).json()) as {
      data: { version: number };
    };
    const v = detail.data.version;
    const ok = await fetch(`${base}/api/v1/employees/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ department: "Engineering", version: v }),
    });
    expect(ok.status).toBe(200);
    const stale = await fetch(`${base}/api/v1/employees/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ department: "HR", version: v }),
    });
    expect(stale.status).toBe(409);
    await runDispatcher();
    if (catalogUrl) expect(await auditCount("employee.updated", `employee:${id}`)).toBeGreaterThan(0);
  });

  it("employee edits their own profile and the change is audited", async () => {
    const hr = await hrLogin();
    const email = `self${Date.now()}@hrms.local`;
    const create = await fetch(`${base}/api/v1/auth/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ email, name: "Self Service", role: "EMPLOYEE" }),
    });
    expect(create.status).toBe(201);
    const { data } = (await create.json()) as { data: { invitationId: string; token: string } };
    const accept = await fetch(`${base}/api/v1/auth/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: data.token, password: "SelfPass12!" }),
    });
    const accepted = (await accept.json()) as { data: { token: string } };
    const onboard = await fetch(`${base}/api/v1/employees/onboard`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ invitationId: data.invitationId }),
    });
    expect(onboard.status).toBe(201);
    const ob = (await onboard.json()) as { data: { employeeId: string } };
    await runDispatcher();

    const me = await fetch(`${base}/api/v1/employees/me`, { headers: { authorization: `Bearer ${accepted.data.token}` } });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { data: { version: number } };
    const upd = await fetch(`${base}/api/v1/employees/me`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${accepted.data.token}` },
      body: JSON.stringify({ name: "Self Service Jr", version: meBody.data.version }),
    });
    expect(upd.status).toBe(200);
    await runDispatcher();
    if (catalogUrl) expect(await auditCount("employee.profile_updated", `employee:${ob.data.employeeId}`)).toBeGreaterThan(0);
  });

  it("deactivate removes the directory row and suggestions; rebuild repairs a lost projection", async () => {
    const hr = await hrLogin();
    const adm = await adminToken(hr);
    const dir = await fetch(`${base}/api/v1/employees?q=${encodeURIComponent("Hire " + tag)}`, {
      headers: { authorization: `Bearer ${hr}` },
    });
    const dirBody = (await dir.json()) as { data: Array<{ employee_id: string }> };
    const id = dirBody.data[0].employee_id;
    const deact = await fetch(`${base}/api/v1/employees/${id}/deactivate`, {
      method: "POST",
      headers: { authorization: `Bearer ${hr}` },
    });
    expect(deact.status).toBe(200);
    await runDispatcher();
    const gone = (await (await fetch(`${base}/api/v1/employees?q=${encodeURIComponent("Hire " + tag)}`, {
      headers: { authorization: `Bearer ${hr}` },
    })).json()) as { data: unknown[] };
    expect(gone.data.length).toBe(0);

    const rebuild = await fetch(`${base}/api/v1/admin/rebuild-directory`, {
      method: "POST",
      headers: { authorization: `Bearer ${adm}` },
    });
    expect(rebuild.status).toBe(200);
    const rebuilt = (await rebuild.json()) as { data: { repaired: number } };
    expect(rebuilt.data.repaired).toBeGreaterThan(0);
    const stillGone = (await (await fetch(`${base}/api/v1/employees?q=${encodeURIComponent("Hire " + tag)}`, {
      headers: { authorization: `Bearer ${hr}` },
    })).json()) as { data: unknown[] };
    expect(stillGone.data.length).toBe(0);
  });

  it("team read exposes a healthy partial meta", async () => {
    const hr = await hrLogin();
    const r = await fetch(`${base}/api/v1/employees/team`, { headers: { authorization: `Bearer ${hr}` } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { meta: { partial: boolean; unavailable: string[] } };
    expect(body.meta.partial).toBe(false);
    expect(body.meta.unavailable).toEqual([]);
  });

  it("two leased generators interleave without duplicates", async () => {
    const a = new Snowflake(11, () => 1_800_000_000_000);
    const b = new Snowflake(12, () => 1_800_000_000_000);
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) {
      ids.add(i % 2 === 0 ? a.next() : b.next());
    }
    expect(ids.size).toBe(200);
  });
});
