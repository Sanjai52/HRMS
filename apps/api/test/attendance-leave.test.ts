import { describe, it, expect, beforeAll } from "vitest";

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

async function employeeVersion(hr: string, id: string): Promise<number> {
  const r = await fetch(`${base}/api/v1/employees/${id}`, { headers: { authorization: `Bearer ${hr}` } });
  const body = (await r.json()) as { data: { version: number } };
  return body.data.version;
}

async function setManager(hr: string, employeeId: string, managerId: string): Promise<void> {
  const v = await employeeVersion(hr, employeeId);
  const r = await fetch(`${base}/api/v1/employees/${employeeId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
    body: JSON.stringify({ version: v, managerId }),
  });
  expect(r.status).toBe(200);
}

async function applyLeave(token: string, start: string, end: string, type = "CASUAL"): Promise<{ status: number; id?: string }> {
  const r = await fetch(`${base}/api/v1/leave/requests`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ type, start, end, reason: "test leave" }),
  });
  if (r.status !== 201) return { status: r.status };
  const body = (await r.json()) as { data: { request_id: string } };
  return { status: 201, id: body.data.request_id };
}

async function getRequest(token: string, id: string): Promise<{ status: string; version: number }> {
  const r = await fetch(`${base}/api/v1/leave/requests?mine=true`, { headers: { authorization: `Bearer ${token}` } });
  const body = (await r.json()) as { data: Array<{ request_id: string; status: string; version: number }> };
  const found = body.data.find((x) => x.request_id === id);
  expect(found).toBeDefined();
  return { status: found!.status, version: found!.version };
}

describe("Phase 4 attendance and leave", () => {
  beforeAll(async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
  });

  it("check-in is idempotent; check-out needs an open check-in", async () => {
    const hr = await hrLogin();
    const a = await makePerson(hr, "Atty One");
    const in1 = await fetch(`${base}/api/v1/attendance/check-in`, { method: "POST", headers: { authorization: `Bearer ${a.token}` } });
    expect(in1.status).toBe(201);
    const in2 = await fetch(`${base}/api/v1/attendance/check-in`, { method: "POST", headers: { authorization: `Bearer ${a.token}` } });
    const in2Body = (await in2.json()) as { data: { duplicate: boolean } };
    expect(in2Body.data.duplicate).toBe(true);
    const out = await fetch(`${base}/api/v1/attendance/check-out`, { method: "POST", headers: { authorization: `Bearer ${a.token}` } });
    expect(out.status).toBe(200);

    const b = await makePerson(hr, "Atty Two");
    const bad = await fetch(`${base}/api/v1/attendance/check-out`, { method: "POST", headers: { authorization: `Bearer ${b.token}` } });
    expect(bad.status).toBe(409);

    const me = await fetch(`${base}/api/v1/attendance/me`, { headers: { authorization: `Bearer ${a.token}` } });
    const meBody = (await me.json()) as { data: { today: unknown; summary: { present: number; late: number } } };
    expect(meBody.data.today).not.toBeNull();
  });

  it("member -> manager -> HR approval chain approves, decrements balance, notifies", async () => {
    const hr = await hrLogin();
    const m = await makePerson(hr, "Manny Ager", "MANAGER");
    const e = await makePerson(hr, "Emmy Ployee");
    await setManager(hr, e.employeeId, m.employeeId);

    const applied = await applyLeave(e.token, "2026-10-19", "2026-10-21");
    expect(applied.status).toBe(201);
    let req = await getRequest(e.token, applied.id!);
    expect(req.status).toBe("PENDING_MANAGER");

    const mApprove = await fetch(`${base}/api/v1/leave/requests/${applied.id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${m.token}` },
      body: JSON.stringify({ version: req.version }),
    });
    expect(mApprove.status).toBe(200);
    req = await getRequest(e.token, applied.id!);
    expect(req.status).toBe("PENDING_HR");

    const hrApprove = await fetch(`${base}/api/v1/leave/requests/${applied.id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ version: req.version }),
    });
    expect(hrApprove.status).toBe(200);
    await fetch(`${base}/system/test/run-dispatcher`, { method: "POST" });

    const bal = await fetch(`${base}/api/v1/leave/balances?employeeId=${e.employeeId}`, { headers: { authorization: `Bearer ${hr}` } });
    const balBody = (await bal.json()) as { data: Array<{ leave_type: string; used_days: number }> };
    expect(balBody.data.find((b) => b.leave_type === "CASUAL")?.used_days).toBe(3);

    const notifs = await fetch(`${base}/api/v1/notifications`, { headers: { authorization: `Bearer ${e.token}` } });
    const nBody = (await notifs.json()) as { data: Array<{ title: string }> };
    expect(nBody.data.some((n) => n.title === "Leave approved")).toBe(true);

    const mail = await fetch(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(e.email)}`);
    const mailBody = (await mail.json()) as { total: number };
    expect(mailBody.total).toBeGreaterThan(0);
  });

  it("overlap and insufficient balance are rejected", async () => {
    const hr = await hrLogin();
    const e = await makePerson(hr, "Emmy Overlap");
    const first = await applyLeave(e.token, "2026-10-19", "2026-10-21");
    expect(first.status).toBe(201);
    const clash = await applyLeave(e.token, "2026-10-20", "2026-10-22");
    expect(clash.status).toBe(409);
    const broke = await applyLeave(e.token, "2026-11-02", "2026-11-30");
    expect(broke.status).toBe(409);
  });

  it("no manager means straight to HR; self-approval is blocked", async () => {
    const hr = await hrLogin();
    const loner = await makePerson(hr, "Loner Wolf");
    const applied = await applyLeave(loner.token, "2026-10-26", "2026-10-27");
    expect(applied.status).toBe(201);
    const req = await getRequest(loner.token, applied.id!);
    expect(req.status).toBe("PENDING_HR");

    const boss = await makePerson(hr, "Boss Lady", "ADMIN");
    const bApplied = await applyLeave(boss.token, "2026-10-26", "2026-10-27");
    const bReq = await getRequest(boss.token, bApplied.id!);
    const self = await fetch(`${base}/api/v1/leave/requests/${bApplied.id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${boss.token}` },
      body: JSON.stringify({ version: bReq.version }),
    });
    expect(self.status).toBe(403);
    const hrApprove = await fetch(`${base}/api/v1/leave/requests/${bApplied.id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ version: bReq.version }),
    });
    expect(hrApprove.status).toBe(200);
  });

  it("manager rejection can be overridden by HR with a reason", async () => {
    const hr = await hrLogin();
    const m = await makePerson(hr, "Manny Strict", "MANAGER");
    const e = await makePerson(hr, "Emmy Appeal");
    await setManager(hr, e.employeeId, m.employeeId);
    const applied = await applyLeave(e.token, "2026-11-02", "2026-11-03");
    let req = await getRequest(e.token, applied.id!);
    const rej = await fetch(`${base}/api/v1/leave/requests/${applied.id}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${m.token}` },
      body: JSON.stringify({ version: req.version }),
    });
    expect(rej.status).toBe(200);
    req = await getRequest(e.token, applied.id!);
    expect(req.status).toBe("REJECTED");
    const noReason = await fetch(`${base}/api/v1/leave/requests/${applied.id}/override`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ version: req.version, reason: "" }),
    });
    expect(noReason.status).toBe(403);
    const over = await fetch(`${base}/api/v1/leave/requests/${applied.id}/override`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ version: req.version, reason: "Critical project cover arranged" }),
    });
    expect(over.status).toBe(200);
    req = await getRequest(e.token, applied.id!);
    expect(req.status).toBe("APPROVED");
  });

  it("deactivating a manager reassigns team requests to HR; cancel restores balance", async () => {
    const hr = await hrLogin();
    const m = await makePerson(hr, "Manny Gone", "MANAGER");
    const e = await makePerson(hr, "Emmy Orphan");
    await setManager(hr, e.employeeId, m.employeeId);
    const applied = await applyLeave(e.token, "2026-11-09", "2026-11-10");
    let req = await getRequest(e.token, applied.id!);
    expect(req.status).toBe("PENDING_MANAGER");

    const mv = await employeeVersion(hr, m.employeeId);
    const deact = await fetch(`${base}/api/v1/employees/${m.employeeId}/deactivate`, {
      method: "POST",
      headers: { authorization: `Bearer ${hr}` },
    });
    expect(deact.status).toBe(200);
    void mv;
    req = await getRequest(e.token, applied.id!);
    expect(req.status).toBe("PENDING_HR");

    const hrApprove = await fetch(`${base}/api/v1/leave/requests/${applied.id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ version: req.version }),
    });
    expect(hrApprove.status).toBe(200);
    req = await getRequest(e.token, applied.id!);
    const cancel = await fetch(`${base}/api/v1/leave/requests/${applied.id}/cancel`, {
      method: "POST",
      headers: { authorization: `Bearer ${hr}` },
    });
    expect(cancel.status).toBe(200);
    const bal = await fetch(`${base}/api/v1/leave/balances?employeeId=${e.employeeId}`, { headers: { authorization: `Bearer ${hr}` } });
    const balBody = (await bal.json()) as { data: Array<{ leave_type: string; used_days: number }> };
    expect(balBody.data.find((b) => b.leave_type === "CASUAL")?.used_days).toBe(0);
    void req;
  });
});
