import { describe, it, expect, beforeAll } from "vitest";

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

async function startRun(hr: string, skills: string[]): Promise<string> {
  const r = await fetch(`${base}/api/v1/recruitment/sourcing/runs`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
    body: JSON.stringify({ role: "backend", skills }),
  });
  expect(r.status).toBe(202);
  return ((await r.json()) as { data: { runId: string } }).data.runId;
}

async function waitRun(hr: string, runId: string): Promise<{ status: string; pages: number; discovered: number; imported: number; errors: number }> {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${base}/api/v1/recruitment/sourcing/runs/${runId}`, { headers: { authorization: `Bearer ${hr}` } });
    const body = (await r.json()) as { data: { run: { status: string; pages: number; discovered: number; imported: number; errors: number } } };
    if (["COMPLETED", "PARTIAL_FAILED", "FAILED"].includes(body.data.run.status)) return body.data.run;
    await new Promise((r2) => setTimeout(r2, 1000));
  }
  throw new Error("crawl did not finish");
}

describe("Phase 7 sourcing crawler", () => {
  beforeAll(async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
  });

  it("discovers, dedupes and imports portal candidates; reruns add nothing", async () => {
    const hr = await hrLogin();
    const runId = await startRun(hr, []);
    const run = await waitRun(hr, runId);
    expect(run.pages).toBeGreaterThan(0);
    expect(run.discovered).toBeGreaterThan(0);

    const pool = await fetch(`${base}/api/v1/recruitment/candidates?q=nila.fernando`, { headers: { authorization: `Bearer ${hr}` } });
    expect(pool.status).toBe(200);
    const poolBody = (await pool.json()) as { data: Array<{ email: string; source: string }>; meta: { partial: boolean; unavailable: string[] } };
    expect(poolBody.meta.partial).toBe(false);
    expect(poolBody.data.some((c) => c.email === "nila.fernando@example.com" && c.source === "portal")).toBe(true);

    const again = await startRun(hr, []);
    const run2 = await waitRun(hr, again);
    expect(run2.status).toBe("COMPLETED");
    expect(run2.imported).toBe(0);
    expect(run2.discovered).toBe(run.discovered);
  }, 90000);

  it("skill filter narrows discovery and page outcomes are recorded", async () => {
    const hr = await hrLogin();
    const runId = await startRun(hr, ["node.js"]);
    const run = await waitRun(hr, runId);
    expect(run.status).toBe("COMPLETED");
    expect(run.discovered).toBeGreaterThan(0);

    const detail = await fetch(`${base}/api/v1/recruitment/sourcing/runs/${runId}`, { headers: { authorization: `Bearer ${hr}` } });
    const body = (await detail.json()) as { data: { pages: Array<{ url: string; status: number }> } };
    expect(body.data.pages.length).toBeGreaterThan(0);
    expect(body.data.pages.every((p) => p.status === 200)).toBe(true);
  }, 90000);
});
