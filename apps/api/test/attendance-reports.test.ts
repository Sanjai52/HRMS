import { describe, it, expect, beforeAll } from "vitest";
import { Pool } from "pg";

const base = process.env.API_BASE ?? "http://localhost:4000";
const catalogUrl = process.env.CATALOG_DATABASE_URL;
const tag = Date.now();

const day1 = "2026-10-05";
const day2 = "2026-10-06";
const department = `T15 Support ${tag}`;

interface Person {
  token: string;
  employeeId: string;
  shard: string;
  email: string;
}

interface DayRow {
  workday: string;
  present: number;
  late: number;
  absent: number;
  halfDay: number;
}

interface DepartmentRow extends DayRow {
  department: string;
  total: number;
}

interface ReportShape {
  from: string;
  to: string;
  department: string | null;
  totals: { present: number; late: number; absent: number; halfDay: number };
  days: DayRow[];
  departments: DepartmentRow[];
}

let hr = "";
let alice: Person;
let bob: Person;

async function hrLogin(): Promise<string> {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "hr@hrms.local", password: "ChangeMe123!" }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { token: string } }).data.token;
}

async function makePerson(token: string, name: string): Promise<Person> {
  const email = `${name.replace(/[^a-z]/gi, "").toLowerCase()}${tag}${Math.floor(Math.random() * 10000)}@hrms.local`;
  const create = await fetch(`${base}/api/v1/auth/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, name, role: "EMPLOYEE" }),
  });
  expect(create.status).toBe(201);
  const { data } = (await create.json()) as { data: { invitationId: string; token: string } };
  const accept = await fetch(`${base}/api/v1/auth/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: data.token, password: "T15Person1!" }),
  });
  expect(accept.status).toBe(201);
  const accepted = (await accept.json()) as { data: { token: string } };
  const onboard = await fetch(`${base}/api/v1/employees/onboard`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ invitationId: data.invitationId }),
  });
  expect(onboard.status).toBe(201);
  const ob = (await onboard.json()) as { data: { employeeId: string; shard: string } };
  await fetch(`${base}/system/test/run-dispatcher`, { method: "POST" });
  return { token: accepted.data.token, employeeId: ob.data.employeeId, shard: ob.data.shard, email };
}

async function setDepartment(token: string, employeeId: string, dept: string): Promise<void> {
  const v = await fetch(`${base}/api/v1/employees/${employeeId}`, { headers: { authorization: `Bearer ${token}` } });
  const body = (await v.json()) as { data: { version: number } };
  const patch = await fetch(`${base}/api/v1/employees/${employeeId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ version: body.data.version, department: dept }),
  });
  expect(patch.status).toBe(200);
}

function correct(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${base}/api/v1/attendance/corrections`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function getReport(token: string, query = ""): Promise<Response> {
  return fetch(`${base}/api/v1/attendance/reports${query}`, { headers: { authorization: `Bearer ${token}` } });
}

async function dayRowStatus(employeeId: string, workday: string): Promise<string | undefined> {
  const r = await fetch(`${base}/api/v1/attendance/day?date=${workday}`, { headers: { authorization: `Bearer ${hr}` } });
  expect(r.status).toBe(200);
  const body = (await r.json()) as { data: Array<{ employee_id: string; workday: string; status: string }> };
  // The day query already filters by date, so at most one row exists per employee.
  return body.data.find((row) => row.employee_id === employeeId)?.status;
}

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

describe("Phase 10b attendance reports and HR corrections", () => {
  beforeAll(async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
    hr = await hrLogin();
    alice = await makePerson(hr, "T15 Alice");
    bob = await makePerson(hr, "T15 Bob");
    await setDepartment(hr, alice.employeeId, department);
    await setDepartment(hr, bob.employeeId, department);
    const seeds: Array<Record<string, unknown>> = [
      { employeeId: alice.employeeId, workday: day1, status: "PRESENT", checkIn: "09:00", checkOut: "18:00", reason: "T15 fixture seed" },
      { employeeId: alice.employeeId, workday: day2, status: "ABSENT", reason: "T15 fixture seed" },
      { employeeId: bob.employeeId, workday: day1, status: "LATE", reason: "T15 fixture seed" },
      { employeeId: bob.employeeId, workday: day2, status: "HALF_DAY", reason: "T15 fixture seed" },
    ];
    for (const seed of seeds) {
      const r = await correct(hr, seed);
      expect(r.status).toBe(200);
    }
  }, 90000);

  it("defaults to the current month and returns a healthy partial meta", async () => {
    const month = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
    const res = await getReport(hr);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ReportShape; meta: { partial: boolean; unavailable: string[] } };
    expect(body.data.from).toBe(`${month}-01`);
    expect(body.data.to.slice(0, 7)).toBe(month);
    expect(body.meta.partial).toBe(false);
    expect(body.meta.unavailable).toEqual([]);
    expect(Array.isArray(body.data.days)).toBe(true);
  }, 30000);

  it("per-day and per-department totals match the seeded fixture; EMPLOYEE is denied", async () => {
    const res = await getReport(hr, `?from=${day1}&to=${day2}&department=${encodeURIComponent(department)}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ReportShape };
    expect(body.data.from).toBe(day1);
    expect(body.data.to).toBe(day2);
    expect(body.data.department).toBe(department);

    const d1 = body.data.days.find((d) => d.workday === day1);
    const d2 = body.data.days.find((d) => d.workday === day2);
    expect(d1).toEqual({ workday: day1, present: 1, late: 1, absent: 0, halfDay: 0 });
    expect(d2).toEqual({ workday: day2, present: 0, late: 0, absent: 1, halfDay: 1 });
    expect(body.data.totals).toEqual({ present: 1, late: 1, absent: 1, halfDay: 1 });

    const dept = body.data.departments.find((d) => d.department === department);
    expect(dept).toEqual({ department, present: 1, late: 1, absent: 1, halfDay: 1, total: 4 });

    const asEmployee = await getReport(alice.token, `?from=${day1}&to=${day2}`);
    expect(asEmployee.status).toBe(403);
    const writeAsEmployee = await correct(alice.token, { employeeId: alice.employeeId, workday: day1, status: "PRESENT", reason: "rogue fix" });
    expect(writeAsEmployee.status).toBe(403);
  }, 30000);

  it("a correction rewrites the row, shifts the report, and leaves an audit event", async () => {
    const res = await correct(hr, { employeeId: alice.employeeId, workday: day1, status: "ABSENT", reason: "Badge reader outage" });
    expect(res.status).toBe(200);
    expect(await dayRowStatus(alice.employeeId, day1)).toBe("ABSENT");

    for (let i = 0; i < 2; i += 1) await fetch(`${base}/system/test/run-dispatcher`, { method: "POST" });
    if (catalogUrl) expect(await auditCount("attendance.corrected", `attendance:${alice.employeeId}:${day1}`)).toBeGreaterThan(0);

    const report = await getReport(hr, `?from=${day1}&to=${day1}&department=${encodeURIComponent(department)}`);
    const body = (await report.json()) as { data: ReportShape };
    expect(body.data.days.find((d) => d.workday === day1)).toEqual({ workday: day1, present: 0, late: 1, absent: 1, halfDay: 0 });
  }, 30000);

  it("validates reason length, status, workday format, and unknown employees", async () => {
    const shortReason = await correct(hr, { employeeId: alice.employeeId, workday: day1, status: "PRESENT", reason: "no" });
    expect(shortReason.status).toBe(400);
    const badStatus = await correct(hr, { employeeId: alice.employeeId, workday: day1, status: "REMOTE", reason: "work from home day" });
    expect(badStatus.status).toBe(400);
    const badDay = await correct(hr, { employeeId: alice.employeeId, workday: "10-05-2026", status: "PRESENT", reason: "wrong format" });
    expect(badDay.status).toBe(400);
    const unknown = await correct(hr, { employeeId: "00000000-0000-4000-8000-000000000000", workday: day1, status: "PRESENT", reason: "ghost employee" });
    expect(unknown.status).toBe(404);
  }, 30000);

  it("corrections are refused while the owning shard gate is closed", async () => {
    const url = process.env[`DATABASE_SHARD_${alice.shard.slice(-1)}_URL`];
    if (!url) return;
    const pool = new Pool({ connectionString: url });
    try {
      await pool.query("UPDATE shard_write_gate SET state = 'GATED', epoch = $1 WHERE id = 1", [Date.now()]);
      const gated = await correct(hr, { employeeId: alice.employeeId, workday: day1, status: "PRESENT", reason: "should stay gated" });
      expect(gated.status).toBe(503);
      const body = (await gated.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe("GATE_CLOSED");
    } finally {
      await pool.query("UPDATE shard_write_gate SET state = 'OPEN' WHERE id = 1");
      await pool.end();
    }
  }, 30000);
});
