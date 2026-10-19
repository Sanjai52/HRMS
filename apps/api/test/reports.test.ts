import { describe, it, expect } from "vitest";

const base = process.env.API_BASE ?? "http://localhost:4000";

async function hrLogin(): Promise<string> {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "hr@hrms.local", password: "ChangeMe123!" }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { token: string } }).data.token;
}

describe("Phase 10b reports overview", () => {
  it("HR overview carries a healthy partial meta", async () => {
    const hr = await hrLogin();
    const r = await fetch(`${base}/api/v1/reports/overview`, { headers: { authorization: `Bearer ${hr}` } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { data: { month: string; headcount: unknown[] }; meta: { partial: boolean; unavailable: string[] } };
    expect(body.meta.partial).toBe(false);
    expect(body.meta.unavailable).toEqual([]);
    expect(body.data.month).toMatch(/^\d{4}-\d{2}$/);
  });
});
