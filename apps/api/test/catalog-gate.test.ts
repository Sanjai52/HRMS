import { describe, it, expect, beforeAll } from "vitest";
import { Pool } from "pg";

const base = process.env.API_BASE ?? "http://localhost:4000";
const tag = Date.now();

async function hrLogin(): Promise<string> {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "hr@hrms.local", password: "ChangeMe123!" }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { token: string } }).data.token;
}

async function adminToken(hr: string): Promise<string> {
  const email = `gateboss${tag}@hrms.local`;
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
    body: JSON.stringify({ token: data.token, password: "GateBossPass1!" }),
  });
  expect(accept.status).toBe(201);
  return ((await accept.json()) as { data: { token: string } }).data.token;
}

async function makePerson(hr: string, name: string): Promise<{ employeeId: string; email: string }> {
  const email = `${name.replace(/[^a-z]/gi, "").toLowerCase()}${tag}@hrms.local`;
  const create = await fetch(`${base}/api/v1/auth/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
    body: JSON.stringify({ email, name, role: "EMPLOYEE" }),
  });
  expect(create.status).toBe(201);
  const { data } = (await create.json()) as { data: { invitationId: string; token: string } };
  const accept = await fetch(`${base}/api/v1/auth/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: data.token, password: "GatePerson1!" }),
  });
  expect(accept.status).toBe(201);
  const onboard = await fetch(`${base}/api/v1/employees/onboard`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
    body: JSON.stringify({ invitationId: data.invitationId }),
  });
  expect(onboard.status).toBe(201);
  const ob = (await onboard.json()) as { data: { employeeId: string } };
  await fetch(`${base}/system/test/run-dispatcher`, { method: "POST" });
  return { employeeId: ob.data.employeeId, email };
}

function post(path: string, token?: string, body?: Record<string, unknown>): () => Promise<Response> {
  return () =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
}

describe("Phase 10b catalog write gate coverage", () => {
  beforeAll(async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
  });

  it("every catalog-owned mutation refuses writes while catalog_write_gate is GATED", async () => {
    const hr = await hrLogin();
    const admin = await adminToken(hr);

    // Pre-create the resources the close/apply/deactivate paths need, while the gate is OPEN.
    const closeJob = await post("/api/v1/jobs", hr, { title: `Gate Close Job ${tag}`, department: "Engineering" })();
    expect(closeJob.status).toBe(201);
    const closeJobId = ((await closeJob.json()) as { data: { jobId: string } }).data.jobId;

    const applyJob = await post("/api/v1/jobs", hr, { title: `Gate Apply Job ${tag}`, department: "Engineering" })();
    expect(applyJob.status).toBe(201);
    const applyJobId = ((await applyJob.json()) as { data: { jobId: string } }).data.jobId;

    const cycle = await post("/api/v1/performance/cycles", hr, { name: `Gate Cycle ${tag}`, start: "2026-01-01", end: "2026-06-30" })();
    expect(cycle.status).toBe(201);
    const cycleId = ((await cycle.json()) as { data: { cycleId: string } }).data.cycleId;

    const person = await makePerson(hr, "Gate Person");

    const catalog = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
    try {
      await catalog.query("UPDATE catalog_write_gate SET state = 'GATED', epoch = $1, updated_at = now() WHERE id = 1", [Date.now()]);

      const checks: Array<{ name: string; call: () => Promise<Response> }> = [
        { name: "jobs.create", call: post("/api/v1/jobs", hr, { title: `Gated Job ${tag}` }) },
        { name: "jobs.close", call: post(`/api/v1/jobs/${closeJobId}/close`, hr) },
        { name: "short-urls.create", call: post("/api/v1/short-urls", hr, { destination: `/jobs/x-${tag}` }) },
        { name: "admin.departments", call: post("/api/v1/admin/settings/departments", hr, { name: `Gated Dept ${tag}` }) },
        { name: "admin.designations", call: post("/api/v1/admin/settings/designations", hr, { name: `Gated Desig ${tag}` }) },
        { name: "admin.rebuild-directory", call: post("/api/v1/admin/rebuild-directory", admin) },
        { name: "performance.cycles.create", call: post("/api/v1/performance/cycles", hr, { name: `Gated Cycle ${tag}`, start: "2026-01-01", end: "2026-06-30" }) },
        { name: "performance.cycles.close", call: post(`/api/v1/performance/cycles/${cycleId}/close`, hr) },
        { name: "payroll.batches.create", call: post("/api/v1/payroll/batches", hr, { period: "2026-10" }) },
        { name: "sourcing.runs.create", call: post("/api/v1/recruitment/sourcing/runs", hr, { role: "backend", skills: [] }) },
        { name: "applications.apply", call: post(`/api/v1/recruitment/jobs/${applyJobId}/applications`, undefined, { name: "Gated Applicant", email: `gatedapply${tag}@example.com` }) },
        { name: "employees.deactivate", call: post(`/api/v1/employees/${person.employeeId}/deactivate`, hr) },
      ];

      const results: string[] = [];
      for (const check of checks) {
        const res = await check.call();
        const body = (await res.json()) as { error?: { code?: string } };
        results.push(`${check.name}->${res.status} ${body.error?.code ?? ""}`);
      }

      expect(results).toEqual(checks.map((c) => `${c.name}->503 GATE_CLOSED`));
    } finally {
      await catalog.query("UPDATE catalog_write_gate SET state = 'OPEN', updated_at = now() WHERE id = 1");
      const ok = await post("/api/v1/jobs", hr, { title: `Reopened Job ${tag}` })();
      expect(ok.status).toBe(201);
      await catalog.end();
    }
  }, 120000);
});
