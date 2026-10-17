import { describe, it, expect, beforeAll } from "vitest";
import { Pool } from "pg";

const base = process.env.API_BASE ?? "http://localhost:4000";
const tag = Date.now();

const SHARD_URLS: Array<[string, string | undefined]> = [
  ["shard-1", process.env.DATABASE_SHARD_1_URL],
  ["shard-2", process.env.DATABASE_SHARD_2_URL],
  ["shard-3", process.env.DATABASE_SHARD_3_URL],
];

async function hrLogin(): Promise<string> {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "hr@hrms.local", password: "ChangeMe123!" }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { token: string } }).data.token;
}

async function makePerson(hr: string, name: string, role = "EMPLOYEE"): Promise<{ token: string; employeeId: string; email: string }> {
  const email = `${name.replace(/[^a-z]/gi, "").toLowerCase()}${tag}@hrms.local`;
  const create = await fetch(`${base}/api/v1/auth/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
    body: JSON.stringify({ email, name, role }),
  });
  expect(create.status).toBe(201);
  const { data } = (await create.json()) as { data: { invitationId: string; token: string } };
  const accept = await fetch(`${base}/api/v1/auth/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: data.token, password: "FencePass12!" }),
  });
  expect(accept.status).toBe(201);
  const accepted = (await accept.json()) as { data: { token: string } };
  const onboard = await fetch(`${base}/api/v1/employees/onboard`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
    body: JSON.stringify({ invitationId: data.invitationId }),
  });
  expect(onboard.status).toBe(201);
  const ob = (await onboard.json()) as { data: { employeeId: string } };
  await fetch(`${base}/system/test/run-dispatcher`, { method: "POST" });
  return { token: accepted.data.token, employeeId: ob.data.employeeId, email };
}

async function setManager(hr: string, employeeId: string, managerId: string): Promise<void> {
  const detail = (await (await fetch(`${base}/api/v1/employees/${employeeId}`, { headers: { authorization: `Bearer ${hr}` } })).json()) as { data: { version: number } };
  const r = await fetch(`${base}/api/v1/employees/${employeeId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
    body: JSON.stringify({ version: detail.data.version, managerId }),
  });
  expect(r.status).toBe(200);
}

async function createJob(hr: string, title: string): Promise<string> {
  const r = await fetch(`${base}/api/v1/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
    body: JSON.stringify({ title, department: "Engineering" }),
  });
  expect(r.status).toBe(201);
  return ((await r.json()) as { data: { jobId: string } }).data.jobId;
}

async function applyToJob(jobId: string, name: string, email: string): Promise<{ status: number; applicationId?: string }> {
  const r = await fetch(`${base}/api/v1/recruitment/jobs/${jobId}/applications`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, email }),
  });
  if (r.status !== 201) return { status: r.status };
  return { status: r.status, applicationId: ((await r.json()) as { data: { applicationId: string } }).data.applicationId };
}

async function stage(hr: string, applicationId: string, to: string, version: number): Promise<{ status: number; code?: string }> {
  const r = await fetch(`${base}/api/v1/recruitment/applications/${applicationId}/stage`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
    body: JSON.stringify({ to, version }),
  });
  const body = (await r.json()) as { error?: { code?: string } };
  return { status: r.status, code: body.error?.code };
}

async function applyLeave(token: string, start: string, end: string): Promise<{ status: number; id?: string }> {
  const r = await fetch(`${base}/api/v1/leave/requests`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ type: "CASUAL", start, end, reason: "fence coverage" }),
  });
  if (r.status !== 201) return { status: r.status };
  const body = (await r.json()) as { data: { request_id: string } };
  return { status: 201, id: body.data.request_id };
}

async function ownRequest(token: string, id: string): Promise<{ status: string; version: number }> {
  const r = await fetch(`${base}/api/v1/leave/requests?mine=true`, { headers: { authorization: `Bearer ${token}` } });
  const body = (await r.json()) as { data: Array<{ request_id: string; status: string; version: number }> };
  const found = body.data.find((x) => x.request_id === id);
  expect(found).toBeDefined();
  return { status: found!.status, version: found!.version };
}

async function approveLeave(token: string, id: string, version: number): Promise<number> {
  const r = await fetch(`${base}/api/v1/leave/requests/${id}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ version }),
  });
  return r.status;
}

function post(path: string, token?: string, body?: Record<string, unknown>): () => Promise<Response> {
  return () =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
}

async function resultOf(name: string, call: () => Promise<Response>): Promise<string> {
  const res = await call();
  const body = (await res.json()) as { error?: { code?: string } };
  return `${name}->${res.status} ${body.error?.code ?? ""}`;
}

describe("Phase 10b shard fence coverage", () => {
  beforeAll(async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
  });

  it("every remaining shard write is refused while its shard gate is GATED", async () => {
    const hr = await hrLogin();

    // Withdrawn application: re-applying with the same email hits the withdrawn-reuse update.
    const job1 = await createJob(hr, `Fence Reuse Job ${tag}`);
    const reuseEmail = `fencereuse${tag}@example.com`;
    const app1 = await applyToJob(job1, "Fence Reuse", reuseEmail);
    expect(app1.status).toBe(201);
    expect((await stage(hr, app1.applicationId!, "WITHDRAWN", 1)).status).toBe(200);

    // Selected application: interview/assessment inserts, interview update and convert.
    const job2 = await createJob(hr, `Fence Interview Job ${tag}`);
    const app2 = await applyToJob(job2, "Fence Interview", `fenceinterview${tag}@example.com`);
    expect(app2.status).toBe(201);
    let v = 1;
    for (const to of ["SCREENING", "SHORTLISTED", "INTERVIEW", "SELECTED"]) {
      expect((await stage(hr, app2.applicationId!, to, v++)).status).toBe(200);
    }

    // Manager + employee: pending leave request (deactivate reassignment) and a delivered notification (read-at).
    const m = await makePerson(hr, "Fence Manager", "MANAGER");
    const e = await makePerson(hr, "Fence Employee");
    await setManager(hr, e.employeeId, m.employeeId);
    const pending = await applyLeave(e.token, "2026-12-07", "2026-12-08");
    expect(pending.status).toBe(201);
    const decided = await applyLeave(e.token, "2026-12-01", "2026-12-02");
    expect(decided.status).toBe(201);
    let req = await ownRequest(e.token, decided.id!);
    expect(req.status).toBe("PENDING_MANAGER");
    expect(await approveLeave(m.token, decided.id!, req.version)).toBe(200);
    req = await ownRequest(e.token, decided.id!);
    expect(req.status).toBe("PENDING_HR");
    expect(await approveLeave(hr, decided.id!, req.version)).toBe(200);
    await fetch(`${base}/system/test/run-dispatcher`, { method: "POST" });
    const notifRes = await fetch(`${base}/api/v1/notifications`, { headers: { authorization: `Bearer ${e.token}` } });
    const notifs = (await notifRes.json()) as { data: Array<{ notification_id: string; title: string }> };
    const notification = notifs.data.find((n) => n.title === "Leave approved");
    expect(notification).toBeDefined();

    const pools: Record<string, Pool> = {};
    for (const [id, url] of SHARD_URLS) {
      expect(url, `missing ${id} url`).toBeTruthy();
      pools[id] = new Pool({ connectionString: url });
    }
    let managerShard = "";
    for (const [id, pool] of Object.entries(pools)) {
      const r = await pool.query("SELECT 1 FROM employees WHERE employee_id = $1", [m.employeeId]);
      if (r.rows.length > 0) managerShard = id;
    }
    expect(managerShard).not.toBe("");

    try {
      for (const pool of Object.values(pools)) {
        await pool.query("UPDATE shard_write_gate SET state = 'GATED', epoch = 11 WHERE id = 1");
      }

      const checks: Array<{ name: string; call: () => Promise<Response> }> = [
        { name: "applications.withdrawn-reuse", call: post(`/api/v1/recruitment/jobs/${job1}/applications`, undefined, { name: "Fence Reuse", email: reuseEmail }) },
        { name: "applications.interview-create", call: post(`/api/v1/recruitment/applications/${app2.applicationId}/interviews`, hr, { round: "Fence round", interviewer: "Fence Lead" }) },
        { name: "applications.interview-update", call: post(`/api/v1/recruitment/applications/${app2.applicationId}/interviews/fence-interview-1`, hr, { status: "COMPLETED", feedback: "gated" }) },
        { name: "applications.assessment-create", call: post(`/api/v1/recruitment/applications/${app2.applicationId}/assessments`, hr, { type: "Fence test", score: "8" }) },
        { name: "applications.convert", call: post(`/api/v1/recruitment/applications/${app2.applicationId}/convert`, hr) },
        { name: "notifications.read", call: post(`/api/v1/notifications/${notification!.notification_id}/read`, e.token) },
      ];

      const failures: string[] = [];
      for (const check of checks) {
        const result = await resultOf(check.name, check.call);
        if (result !== `${check.name}->503 GATE_CLOSED`) failures.push(`expected 503 GATE_CLOSED, got ${result}`);
      }

      // The 503 envelope text is unchanged with the registry deadline in front
      // of the fence: registration expiry surfaces as GATE_CLOSED "retry shortly".
      const envelopeRes = await post(`/api/v1/notifications/${notification!.notification_id}/read`, e.token)();
      expect(envelopeRes.status).toBe(503);
      expect(await envelopeRes.json()).toEqual({
        success: false,
        error: { code: "GATE_CLOSED", message: "Writes are paused for maintenance. Try again shortly." },
      });

      // The deactivate leave-reassignment site is only reached when the manager's own shard is open.
      await pools[managerShard].query("UPDATE shard_write_gate SET state = 'OPEN' WHERE id = 1");
      const deact = await resultOf("employees.deactivate-leave-reassignment", post(`/api/v1/employees/${m.employeeId}/deactivate`, hr));
      if (deact !== "employees.deactivate-leave-reassignment->503 GATE_CLOSED") failures.push(`expected 503 GATE_CLOSED, got ${deact}`);

      expect(failures).toEqual([]);
    } finally {
      for (const pool of Object.values(pools)) {
        await pool.query("UPDATE shard_write_gate SET state = 'OPEN' WHERE id = 1");
      }
      const ok = await post(`/api/v1/notifications/${notification!.notification_id}/read`, e.token)();
      expect(ok.status).toBe(200);
      for (const pool of Object.values(pools)) await pool.end();
    }
  }, 120000);
});
