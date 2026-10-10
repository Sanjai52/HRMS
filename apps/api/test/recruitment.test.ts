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

describe("Phase 6 recruitment and short links", () => {
  beforeAll(async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
  });

  it("HR posts a job, mints a short link, candidate applies and checks status", async () => {
    const hr = await hrLogin();
    const job = await fetch(`${base}/api/v1/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ title: `Backend Engineer ${tag}`, department: "Engineering", location: "Chennai", employmentType: "FULL_TIME" }),
    });
    expect(job.status).toBe(201);
    const { data: j } = (await job.json()) as { data: { jobId: string; slug: string } };

    const pub = await fetch(`${base}/api/v1/jobs`);
    const pubBody = (await pub.json()) as { data: Array<{ job_id: string }> };
    expect(pubBody.data.some((x) => x.job_id === j.jobId)).toBe(true);

    const detail = await fetch(`${base}/api/v1/jobs/${j.slug}`);
    expect(detail.status).toBe(200);

    const short = await fetch(`${base}/api/v1/short-urls`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ destination: `/jobs/${j.slug}` }),
    });
    expect(short.status).toBe(201);
    const { data: s } = (await short.json()) as { data: { code: string } };

    const bad = await fetch(`${base}/api/v1/short-urls`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ destination: "https://evil.example/x" }),
    });
    expect(bad.status).toBe(400);

    const redir = await fetch(`${base}/s/${s.code}`, { redirect: "manual" });
    expect(redir.status).toBe(302);
    expect(redir.headers.get("location")).toContain(`/jobs/${j.slug}`);

    const email = `applicant${tag}@example.com`;
    const form = new FormData();
    form.set("name", "Applicant One");
    form.set("email", email);
    form.set("phone", "9999999999");
    form.set("experience", "3");
    const pdf = Buffer.from("%PDF-1.4 fake resume");
    form.set("resume", new Blob([pdf], { type: "application/pdf" }), "resume.pdf");
    const apply = await fetch(`${base}/api/v1/recruitment/jobs/${j.jobId}/applications`, { method: "POST", body: form });
    expect(apply.status).toBe(201);
    const { data: a } = (await apply.json()) as { data: { applicationId: string; statusToken: string } };

    const dup = await fetch(`${base}/api/v1/recruitment/jobs/${j.jobId}/applications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Applicant One", email }),
    });
    expect(dup.status).toBe(409);

    const status = await fetch(`${base}/api/v1/recruitment/application-status/${a.statusToken}`);
    expect(status.status).toBe(200);
    const statusBody = (await status.json()) as { data: { stage: string } };
    expect(statusBody.data.stage).toBe("APPLIED");
  });

  it("stage machine enforces transitions and versions; convert is idempotent", async () => {
    const hr = await hrLogin();
    const job = await fetch(`${base}/api/v1/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ title: `Designer ${tag}`, department: "Design" }),
    });
    const { data: j } = (await job.json()) as { data: { jobId: string } };
    const email = `creative${tag}@example.com`;
    const apply = await fetch(`${base}/api/v1/recruitment/jobs/${j.jobId}/applications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Creative Person", email }),
    });
    const { data: a } = (await apply.json()) as { data: { applicationId: string } };

    const jump = await fetch(`${base}/api/v1/recruitment/applications/${a.applicationId}/stage`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ to: "SELECTED", version: 1 }),
    });
    expect(jump.status).toBe(400);

    const chain = ["SCREENING", "SHORTLISTED", "INTERVIEW", "SELECTED"];
    let v = 1;
    for (const to of chain) {
      const r = await fetch(`${base}/api/v1/recruitment/applications/${a.applicationId}/stage`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
        body: JSON.stringify({ to, version: v }),
      });
      expect(r.status).toBe(200);
      v += 1;
    }
    const stale = await fetch(`${base}/api/v1/recruitment/applications/${a.applicationId}/stage`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ to: "REJECTED", version: 1 }),
    });
    expect(stale.status).toBe(409);

    const iv = await fetch(`${base}/api/v1/recruitment/applications/${a.applicationId}/interviews`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ round: "Technical 1", interviewer: "Lead Engineer" }),
    });
    expect(iv.status).toBe(201);

    const c1 = await fetch(`${base}/api/v1/recruitment/applications/${a.applicationId}/convert`, {
      method: "POST",
      headers: { authorization: `Bearer ${hr}` },
    });
    expect(c1.status).toBe(201);
    const c2 = await fetch(`${base}/api/v1/recruitment/applications/${a.applicationId}/convert`, {
      method: "POST",
      headers: { authorization: `Bearer ${hr}` },
    });
    const c2Body = (await c2.json()) as { data: { reused: boolean } };
    expect(c2Body.data.reused).toBe(true);

    await fetch(`${base}/system/test/run-dispatcher`, { method: "POST" });
    const adminEmail = `recboss${tag}@hrms.local`;
    const inv = await fetch(`${base}/api/v1/auth/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ email: adminEmail, role: "ADMIN" }),
    });
    expect(inv.status).toBe(201);
    const invBody = (await inv.json()) as { data: { token: string } };
    const acc = await fetch(`${base}/api/v1/auth/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: invBody.data.token, password: "RecBossPass1!" }),
    });
    const accBody = (await acc.json()) as { data: { token: string } };
    const audit = await fetch(`${base}/api/v1/admin/audit-logs?action=application.stage&limit=5`, {
      headers: { authorization: `Bearer ${accBody.data.token}` },
    });
    expect(audit.status).toBe(200);
    const auditBody = (await audit.json()) as { data: unknown[] };
    expect(auditBody.data.length).toBeGreaterThan(0);
  });
});
