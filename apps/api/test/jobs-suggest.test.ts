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

interface JobSuggestion {
  jobId: string;
  title: string;
  slug: string;
}

describe("Public jobs autocomplete (NFR-SEARCH-01)", () => {
  beforeAll(async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
  });

  it("indexes open jobs, falls back to catalog for long prefixes, never suggests candidates, and clears on close", async () => {
    const hr = await hrLogin();
    const title = `Zephyrium Labs Engineer ${tag}`;
    const create = await fetch(`${base}/api/v1/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ title, department: "Engineering" }),
    });
    expect(create.status).toBe(201);
    const { data: j } = (await create.json()) as { data: { jobId: string; slug: string } };

    // Short prefix: served from the Redis index (member shape is jobs-only).
    const short = await fetch(`${base}/api/v1/jobs/suggest?q=${encodeURIComponent(title.slice(0, 8).toLowerCase())}`);
    expect(short.status).toBe(200);
    const shortBody = (await short.json()) as { data: JobSuggestion[]; meta: { source: string } };
    expect(shortBody.meta.source).toBe("cache");
    const hit = shortBody.data.find((s) => s.jobId === j.jobId);
    expect(hit).toBeDefined();
    expect(Object.keys(hit ?? {}).sort()).toEqual(["jobId", "slug", "title"]);

    // Query longer than the indexed prefix cap (12 chars): the catalog fallback still finds it.
    const long = await fetch(`${base}/api/v1/jobs/suggest?q=${encodeURIComponent(title.toLowerCase())}`);
    const longBody = (await long.json()) as { data: JobSuggestion[]; meta: { source: string } };
    expect(longBody.meta.source).toBe("catalog");
    expect(longBody.data.some((s) => s.jobId === j.jobId)).toBe(true);

    // Candidate/HR-private data is excluded from the jobs key space (adversarial check).
    const applicantName = `Suggest Probe ${tag}`;
    const apply = await fetch(`${base}/api/v1/recruitment/jobs/${j.jobId}/applications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: applicantName, email: `suggest-probe${tag}@example.com` }),
    });
    expect(apply.status).toBe(201);
    const probe = await fetch(`${base}/api/v1/jobs/suggest?q=${encodeURIComponent("suggest probe")}`);
    const probeBody = (await probe.json()) as { data: JobSuggestion[] };
    expect(probeBody.data.some((s) => s.title.includes("Suggest Probe"))).toBe(false);

    // Closing the job removes it from both the cache and the fallback.
    const close = await fetch(`${base}/api/v1/jobs/${j.jobId}/close`, {
      method: "POST",
      headers: { authorization: `Bearer ${hr}` },
    });
    expect(close.status).toBe(200);
    const after = await fetch(`${base}/api/v1/jobs/suggest?q=${encodeURIComponent(title.slice(0, 8).toLowerCase())}`);
    const afterBody = (await after.json()) as { data: JobSuggestion[] };
    expect(afterBody.data.some((s) => s.jobId === j.jobId)).toBe(false);
  });
});
