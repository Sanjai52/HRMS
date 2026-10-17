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

async function makePerson(hr: string, name: string, role = "EMPLOYEE"): Promise<{ token: string; employeeId: string }> {
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
  const accepted = (await accept.json()) as { data: { token: string } };
  const onboard = await fetch(`${base}/api/v1/employees/onboard`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
    body: JSON.stringify({ invitationId: data.invitationId }),
  });
  const ob = (await onboard.json()) as { data: { employeeId: string } };
  await fetch(`${base}/system/test/run-dispatcher`, { method: "POST" });
  return { token: accepted.data.token, employeeId: ob.data.employeeId };
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

async function findReviewReleasedOutbox(reviewId: string): Promise<{ event_id: string; type: string } | null> {
  const urls = [process.env.DATABASE_SHARD_1_URL, process.env.DATABASE_SHARD_2_URL, process.env.DATABASE_SHARD_3_URL].filter(
    (u): u is string => typeof u === "string" && u.length > 0
  );
  for (const url of urls) {
    const pool = new Pool({ connectionString: url });
    try {
      const r = await pool.query("SELECT event_id, type FROM outbox_events WHERE type = 'REVIEW_RELEASED' AND payload->>'reviewId' = $1", [reviewId]);
      if (r.rows.length > 0) return r.rows[0] as { event_id: string; type: string };
    } finally {
      await pool.end();
    }
  }
  return null;
}

describe("Phase 8 performance", () => {
  beforeAll(async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
  });

  it("cycle, goal, review submit/release chain notifies the employee", async () => {
    const hr = await hrLogin();
    const cycle = await fetch(`${base}/api/v1/performance/cycles`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ name: `H2 Review ${tag}`, start: "2026-07-01", end: "2026-12-31" }),
    });
    expect(cycle.status).toBe(201);
    const { data: c } = (await cycle.json()) as { data: { cycleId: string } };

    const m = await makePerson(hr, "Perf Manager", "MANAGER");
    const e = await makePerson(hr, "Perf Star");
    await setManager(hr, e.employeeId, m.employeeId);

    const goal = await fetch(`${base}/api/v1/performance/goals`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${m.token}` },
      body: JSON.stringify({ employeeId: e.employeeId, cycleId: c.cycleId, title: "Ship search v2", target: "p95 under 300ms" }),
    });
    expect(goal.status).toBe(201);

    const review = await fetch(`${base}/api/v1/performance/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${m.token}` },
      body: JSON.stringify({ employeeId: e.employeeId, cycleId: c.cycleId, rating: 4, feedback: "Strong quarter" }),
    });
    expect(review.status).toBe(201);
    const { data: rv } = (await review.json()) as { data: { reviewId: string } };

    const submit = await fetch(`${base}/api/v1/performance/reviews/${rv.reviewId}/submit`, {
      method: "POST",
      headers: { authorization: `Bearer ${m.token}` },
    });
    expect(submit.status).toBe(200);

    const hidden = await fetch(`${base}/api/v1/performance/reviews/me?cycleId=${c.cycleId}`, { headers: { authorization: `Bearer ${e.token}` } });
    const hiddenBody = (await hidden.json()) as { data: unknown[] };
    expect(hiddenBody.data.length).toBe(0);

    const release = await fetch(`${base}/api/v1/performance/reviews/${rv.reviewId}/release`, {
      method: "POST",
      headers: { authorization: `Bearer ${hr}` },
    });
    expect(release.status).toBe(200);
    await fetch(`${base}/system/test/run-dispatcher`, { method: "POST" });

    const outbox = await findReviewReleasedOutbox(rv.reviewId);
    if (process.env.DATABASE_SHARD_1_URL) {
      expect(outbox?.type).toBe("REVIEW_RELEASED");
    }

    const mine = await fetch(`${base}/api/v1/performance/reviews/me?cycleId=${c.cycleId}`, { headers: { authorization: `Bearer ${e.token}` } });
    const mineBody = (await mine.json()) as { data: Array<{ rating: number }> };
    expect(mineBody.data.length).toBe(1);
    expect(mineBody.data[0].rating).toBe(4);

    const notifs = await fetch(`${base}/api/v1/notifications`, { headers: { authorization: `Bearer ${e.token}` } });
    const nBody = (await notifs.json()) as { data: Array<{ title: string }> };
    expect(nBody.data.some((n) => n.title === "Review released")).toBe(true);

    const summary = await fetch(`${base}/api/v1/performance/summary?cycleId=${c.cycleId}`, { headers: { authorization: `Bearer ${hr}` } });
    const sBody = (await summary.json()) as { data: { reviews: number; released: number; completion: number; distribution: Record<string, number> }; meta: { partial: boolean; unavailable: string[] } };
    expect(sBody.meta.partial).toBe(false);
    expect(sBody.meta.unavailable).toEqual([]);
    expect(sBody.data.reviews).toBe(1);
    expect(sBody.data.released).toBe(1);
    expect(sBody.data.completion).toBe(100);
    expect(sBody.data.distribution).toEqual({ "4": 1 });
  });

  it("self-review and non-manager review are blocked", async () => {
    const hr = await hrLogin();
    const cycle = await fetch(`${base}/api/v1/performance/cycles`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ name: `Guard ${tag}`, start: "2026-07-01", end: "2026-12-31" }),
    });
    const { data: c } = (await cycle.json()) as { data: { cycleId: string } };
    const m = await makePerson(hr, "Guard Manager", "MANAGER");
    const e = await makePerson(hr, "Guard Star");
    await setManager(hr, e.employeeId, m.employeeId);

    const self = await fetch(`${base}/api/v1/performance/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${m.token}` },
      body: JSON.stringify({ employeeId: m.employeeId, cycleId: c.cycleId, rating: 5 }),
    });
    expect(self.status).toBe(403);
    const selfBody = (await self.json()) as { error: { code: string } };
    expect(selfBody.error.code).toBe("SELF_REVIEW");

    const stranger = await makePerson(hr, "Guard Stranger");
    const other = await fetch(`${base}/api/v1/performance/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${stranger.token}` },
      body: JSON.stringify({ employeeId: e.employeeId, cycleId: c.cycleId, rating: 3 }),
    });
    expect(other.status).toBe(403);

    const empGoal = await fetch(`${base}/api/v1/performance/goals`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${stranger.token}` },
      body: JSON.stringify({ employeeId: e.employeeId, cycleId: c.cycleId, title: "Sneaky goal" }),
    });
    expect(empGoal.status).toBe(403);

    const badRating = await fetch(`${base}/api/v1/performance/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${m.token}` },
      body: JSON.stringify({ employeeId: e.employeeId, cycleId: c.cycleId, rating: 9 }),
    });
    expect(badRating.status).toBe(400);
  });
});
