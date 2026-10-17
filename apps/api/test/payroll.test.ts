import { describe, it, expect, beforeAll } from "vitest";
import { Pool } from "pg";

const base = process.env.API_BASE ?? "http://localhost:4000";
const tag = Date.now();

async function auditCount(action: string, resource: string): Promise<number> {
  const catalogUrl = process.env.CATALOG_DATABASE_URL;
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
    body: JSON.stringify({ token: data.token, password: "PersonPass1!" }),
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

async function setStructure(hr: string, employeeId: string, body: object): Promise<number> {
  const r = await fetch(`${base}/api/v1/payroll/structures`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
    body: JSON.stringify({ employeeId, ...body }),
  });
  return r.status;
}

async function waitBatch(hr: string, batchId: string): Promise<{ status: string; done: number; failed: number; skipped: number }> {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${base}/api/v1/payroll/batches/${batchId}`, { headers: { authorization: `Bearer ${hr}` } });
    const body = (await r.json()) as { data: { batch: { status: string; done: number; failed: number; skipped: number } } };
    if (["COMPLETED", "PARTIAL_FAILED", "FAILED"].includes(body.data.batch.status)) return body.data.batch;
    await new Promise((r2) => setTimeout(r2, 1000));
  }
  throw new Error("batch did not finish");
}

describe("Phase 5 payroll", () => {
  beforeAll(async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
  });

  it("rejects invalid salary structures", async () => {
    const hr = await hrLogin();
    const e = await makePerson(hr, "Pay Negative");
    expect(await setStructure(hr, e.employeeId, { basicPaise: -5, allowancesPaise: 0 })).toBe(400);
    expect(await setStructure(hr, e.employeeId, { basicPaise: 100000, pfPct: 101 })).toBe(400);
    expect(await setStructure(hr, "00000000-0000-0000-0000-000000000000", { basicPaise: 100000 })).toBe(404);
  });

  it("runs an async batch with exact paise math and no duplicates on rerun", async () => {
    const hr = await hrLogin();
    const e = await makePerson(hr, "Pay Exact");
    expect(await setStructure(hr, e.employeeId, { basicPaise: 5000000, allowancesPaise: 2000000, otherDeductionsPaise: 0, pfPct: 12, taxPct: 10 })).toBe(200);
    await fetch(`${base}/system/test/run-dispatcher`, { method: "POST" });
    if (process.env.CATALOG_DATABASE_URL) expect(await auditCount("payroll.structure_updated", `employee:${e.employeeId}`)).toBeGreaterThan(0);

    const run = await fetch(`${base}/api/v1/payroll/batches`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ period: "2026-09" }),
    });
    expect(run.status).toBe(202);
    const { data } = (await run.json()) as { data: { batchId: string } };
    const batch = await waitBatch(hr, data.batchId);
    expect(["COMPLETED", "PARTIAL_FAILED"]).toContain(batch.status);

    const mine = await fetch(`${base}/api/v1/payroll/me?period=2026-09`, { headers: { authorization: `Bearer ${e.token}` } });
    const mineBody = (await mine.json()) as { data: Array<{ record_id: string; gross_paise: number; net_paise: number }> };
    expect(mineBody.data.length).toBe(1);
    const rec = mineBody.data[0];
    expect(rec.gross_paise).toBe(7000000);
    expect(Number.isInteger(rec.net_paise)).toBe(true);

    const detail = await fetch(`${base}/api/v1/payroll/batches/${data.batchId}`, { headers: { authorization: `Bearer ${hr}` } });
    const detailBody = (await detail.json()) as { data: { batch: { status: string }; records: Array<{ record_id: string }> }; meta: { partial: boolean; unavailable: string[] } };
    expect(detailBody.meta.partial).toBe(false);
    expect(detailBody.meta.unavailable).toEqual([]);
    const before = detailBody.data.records.filter((r) => r.record_id === rec.record_id).length;
    expect(before).toBe(1);

    const rerun = await fetch(`${base}/api/v1/payroll/batches`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ period: "2026-09" }),
    });
    expect(rerun.status).toBe(202);
    const { data: r2 } = (await rerun.json()) as { data: { batchId: string } };
    await waitBatch(hr, r2.batchId);
    const mine2 = await fetch(`${base}/api/v1/payroll/me?period=2026-09`, { headers: { authorization: `Bearer ${e.token}` } });
    const mine2Body = (await mine2.json()) as { data: unknown[] };
    expect(mine2Body.data.length).toBe(1);
  });

  it("payslips are restricted to the owner and HR", async () => {
    const hr = await hrLogin();
    const e = await makePerson(hr, "Pay Private");
    await setStructure(hr, e.employeeId, { basicPaise: 3000000, allowancesPaise: 0 });
    const run = await fetch(`${base}/api/v1/payroll/batches`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ period: "2026-08" }),
    });
    const { data } = (await run.json()) as { data: { batchId: string } };
    await waitBatch(hr, data.batchId);
    const mine = (await (await fetch(`${base}/api/v1/payroll/me?period=2026-08`, { headers: { authorization: `Bearer ${e.token}` } })).json()) as {
      data: Array<{ record_id: string }>;
    };
    expect(mine.data.length).toBe(1);
    const other = await makePerson(hr, "Pay Stranger");
    const denied = await fetch(`${base}/api/v1/payroll/payslips/${mine.data[0].record_id}`, { headers: { authorization: `Bearer ${other.token}` } });
    expect(denied.status).toBe(403);
    const allowed = await fetch(`${base}/api/v1/payroll/payslips/${mine.data[0].record_id}`, { headers: { authorization: `Bearer ${e.token}` } });
    expect(allowed.status).toBe(200);
  });
});
