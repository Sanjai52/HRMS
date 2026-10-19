import { describe, it, expect, beforeAll } from "vitest";

const base = process.env.API_BASE ?? "http://localhost:4000";
const tag = Date.now();

interface Person {
  token: string;
  employeeId: string;
  email: string;
}

interface Activity {
  attendance: Array<{ workday: string; check_in: string | null; check_out: string | null; status: string }>;
  leave: Array<{ request_id: string; leave_type: string; status: string }>;
  payroll: Array<{ record_id: string; period: string; net_paise: number }>;
}

let hr = "";
let manager: Person;
let report: Person;
let outsider: Person;

async function hrLogin(): Promise<string> {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "hr@hrms.local", password: "ChangeMe123!" }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { token: string } }).data.token;
}

async function makePerson(token: string, name: string, role = "EMPLOYEE"): Promise<Person> {
  const email = `${name.replace(/[^a-z]/gi, "").toLowerCase()}${tag}${Math.floor(Math.random() * 10000)}@hrms.local`;
  const create = await fetch(`${base}/api/v1/auth/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, name, role }),
  });
  expect(create.status).toBe(201);
  const { data } = (await create.json()) as { data: { invitationId: string; token: string } };
  const accept = await fetch(`${base}/api/v1/auth/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: data.token, password: "T16Person1!" }),
  });
  expect(accept.status).toBe(201);
  const accepted = (await accept.json()) as { data: { token: string } };
  const onboard = await fetch(`${base}/api/v1/employees/onboard`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ invitationId: data.invitationId }),
  });
  expect(onboard.status).toBe(201);
  const ob = (await onboard.json()) as { data: { employeeId: string } };
  await fetch(`${base}/system/test/run-dispatcher`, { method: "POST" });
  return { token: accepted.data.token, employeeId: ob.data.employeeId, email };
}

async function setManager(token: string, employeeId: string, managerId: string): Promise<void> {
  const v = await fetch(`${base}/api/v1/employees/${employeeId}`, { headers: { authorization: `Bearer ${token}` } });
  const body = (await v.json()) as { data: { version: number } };
  const patch = await fetch(`${base}/api/v1/employees/${employeeId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ version: body.data.version, managerId }),
  });
  expect(patch.status).toBe(200);
}

function getActivity(token: string, employeeId: string): Promise<Response> {
  return fetch(`${base}/api/v1/employees/${employeeId}/activity`, { headers: { authorization: `Bearer ${token}` } });
}

describe("Phase 10b manager access and employee activity", () => {
  beforeAll(async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
    hr = await hrLogin();
    manager = await makePerson(hr, "T16 Manager", "MANAGER");
    report = await makePerson(hr, "T16 Report");
    outsider = await makePerson(hr, "T16 Outsider");
    await setManager(hr, report.employeeId, manager.employeeId);
  }, 120000);

  it("HR reads any employee's activity with attendance, leave and payroll slices", async () => {
    const checkIn = await fetch(`${base}/api/v1/attendance/check-in`, { method: "POST", headers: { authorization: `Bearer ${report.token}` } });
    expect(checkIn.status).toBe(201);
    const leave = await fetch(`${base}/api/v1/leave/requests`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${report.token}` },
      body: JSON.stringify({ type: "CASUAL", start: "2026-11-16", end: "2026-11-17", reason: "T16 activity seed" }),
    });
    expect(leave.status).toBe(201);
    const requestId = ((await leave.json()) as { data: { request_id: string } }).data.request_id;

    const res = await getActivity(hr, report.employeeId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Activity };
    expect(body.data.attendance.length).toBeGreaterThan(0);
    expect(body.data.attendance.length).toBeLessThanOrEqual(30);
    const today = body.data.attendance[0];
    expect(today.workday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(today.check_in).not.toBeNull();
    expect(["PRESENT", "LATE"]).toContain(today.status);
    expect(body.data.leave.some((l) => l.request_id === requestId)).toBe(true);
    expect(body.data.leave.length).toBeLessThanOrEqual(20);
    expect(Array.isArray(body.data.payroll)).toBe(true);
    expect(body.data.payroll.length).toBeLessThanOrEqual(12);
  }, 30000);

  it("a manager reads direct reports but not unrelated employees", async () => {
    const profile = await fetch(`${base}/api/v1/employees/${report.employeeId}`, { headers: { authorization: `Bearer ${manager.token}` } });
    expect(profile.status).toBe(200);

    const mine = await getActivity(manager.token, report.employeeId);
    expect(mine.status).toBe(200);
    const body = (await mine.json()) as { data: Activity };
    expect(body.data.attendance.some((a) => a.check_in !== null)).toBe(true);

    const strangerProfile = await fetch(`${base}/api/v1/employees/${outsider.employeeId}`, { headers: { authorization: `Bearer ${manager.token}` } });
    expect(strangerProfile.status).toBe(403);
    const stranger = await getActivity(manager.token, outsider.employeeId);
    expect(stranger.status).toBe(403);
  }, 30000);

  it("an employee reads their own activity but not a colleague's", async () => {
    const mine = await getActivity(report.token, report.employeeId);
    expect(mine.status).toBe(200);
    const denied = await getActivity(report.token, outsider.employeeId);
    expect(denied.status).toBe(403);
  }, 30000);

  it("unknown employees are a 404", async () => {
    const res = await getActivity(hr, "00000000-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
  }, 30000);
});
