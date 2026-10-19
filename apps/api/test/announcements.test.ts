import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { BullMqJobQueue } from "@hrms/core";

const base = process.env.API_BASE ?? "http://localhost:4000";
const catalogUrl = process.env.CATALOG_DATABASE_URL;
const tag = Date.now();

const shardNames = ["shard-1", "shard-2", "shard-3", "shard-4"];
const shardPools: Record<string, Pool> = {};
for (const name of shardNames) {
  const url = process.env[`DATABASE_SHARD_${name.slice(-1)}_URL`];
  if (url) shardPools[name] = new Pool({ connectionString: url });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

async function hrLogin(): Promise<string> {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "hr@hrms.local", password: "ChangeMe123!" }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { token: string } }).data.token;
}

async function makePerson(hr: string, name: string): Promise<{ token: string; employeeId: string; shard: string }> {
  const email = `${name.replace(/[^a-z]/gi, "").toLowerCase()}${tag}${Math.floor(Math.random() * 10000)}@hrms.local`;
  const create = await fetch(`${base}/api/v1/auth/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
    body: JSON.stringify({ email, name, role: "EMPLOYEE" }),
  });
  expect(create.status).toBe(201);
  const { data } = (await create.json()) as { data: { invitationId: string; token: string } };
  const accept = await fetch(`${base}/api/v1/auth/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: data.token, password: "AnnPass12!" }),
  });
  expect(accept.status).toBe(201);
  const accepted = (await accept.json()) as { data: { token: string } };
  const onboard = await fetch(`${base}/api/v1/employees/onboard`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
    body: JSON.stringify({ invitationId: data.invitationId }),
  });
  expect(onboard.status).toBe(201);
  const ob = (await onboard.json()) as { data: { employeeId: string; shard: string } };
  await fetch(`${base}/system/test/run-dispatcher`, { method: "POST" });
  return { token: accepted.data.token, employeeId: ob.data.employeeId, shard: ob.data.shard };
}

async function shardCount(pool: Pool, announcementId: string): Promise<number> {
  const r = await pool.query("SELECT count(*)::int AS c FROM notifications WHERE source_ref = $1", [announcementId]);
  return (r.rows[0] as { c: number }).c;
}

/** Poll until the per-shard fan-out count is non-zero and stops changing. */
async function waitStable(pool: Pool, announcementId: string, timeoutMs = 30000): Promise<number> {
  const start = Date.now();
  let last = -1;
  let stable = 0;
  while (Date.now() - start < timeoutMs) {
    const c = await shardCount(pool, announcementId);
    if (c === last) {
      stable += 1;
      if (stable >= 3 && c > 0) return c;
    } else {
      stable = 0;
      last = c;
    }
    await sleep(500);
  }
  return last;
}

describe("Phase 10b announcements and notification preferences", () => {
  beforeAll(async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
  });

  afterAll(async () => {
    await Promise.all(Object.values(shardPools).map((p) => p.end()));
  });

  it("prefs round-trip: defaults, upsert, and validation", async () => {
    const hr = await hrLogin();
    const person = await makePerson(hr, "Pref Person");

    const initial = await fetch(`${base}/api/v1/notifications/prefs`, { headers: { authorization: `Bearer ${person.token}` } });
    expect(initial.status).toBe(200);
    expect(((await initial.json()) as { data: { email_enabled: boolean; in_app_enabled: boolean } }).data).toEqual({ email_enabled: true, in_app_enabled: true });

    const put = await fetch(`${base}/api/v1/notifications/prefs`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${person.token}` },
      body: JSON.stringify({ email_enabled: false, in_app_enabled: false }),
    });
    expect(put.status).toBe(200);

    const after = await fetch(`${base}/api/v1/notifications/prefs`, { headers: { authorization: `Bearer ${person.token}` } });
    expect(((await after.json()) as { data: { email_enabled: boolean; in_app_enabled: boolean } }).data).toEqual({ email_enabled: false, in_app_enabled: false });

    const bad = await fetch(`${base}/api/v1/notifications/prefs`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${person.token}` },
      body: JSON.stringify({ email_enabled: "yes", in_app_enabled: true }),
    });
    expect(bad.status).toBe(400);
  });

  it("HR announcement fans out per active shard, is audited, and re-runs stay idempotent", async () => {
    const hr = await hrLogin();
    const person = await makePerson(hr, "Ann Target");

    const create = await fetch(`${base}/api/v1/notifications/announcements`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ title: `Office closed ${tag}`, body: "Diwali break next week." }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { data: { announcementId: string; shards: string[] } };
    expect(created.data.shards.length).toBeGreaterThan(0);
    if (catalogUrl) expect(await auditCount("announcement.created", `announcement:${created.data.announcementId}`)).toBeGreaterThan(0);

    const counts: Record<string, number> = {};
    for (const shard of created.data.shards) {
      const pool = shardPools[shard];
      expect(pool).toBeDefined();
      counts[shard] = await waitStable(pool, created.data.announcementId);
      expect(counts[shard]).toBeGreaterThan(0);
    }

    const homePool = shardPools[person.shard];
    const mine = await homePool.query("SELECT kind, title FROM notifications WHERE source_ref = $1 AND employee_id = $2", [created.data.announcementId, person.employeeId]);
    expect(mine.rows.length).toBe(1);
    expect((mine.rows[0] as { kind: string }).kind).toBe("ANNOUNCEMENT");

    const firstShard = created.data.shards[0];
    const queue = new BullMqJobQueue(process.env.REDIS_QUEUE_URL ?? "redis://localhost:6379");
    try {
      const same = await queue.enqueue("announcement-fanout", { announcementId: created.data.announcementId, shard: firstShard }, { jobId: `announce-${created.data.announcementId}-${firstShard}` });
      expect(same.jobId).toBe(`announce-${created.data.announcementId}-${firstShard}`);
      await queue.enqueue("announcement-fanout", { announcementId: created.data.announcementId, shard: firstShard }, { jobId: `announce-${created.data.announcementId}-${firstShard}-replay` });
    } finally {
      await queue.close();
    }
    await sleep(2500);
    for (const shard of created.data.shards) {
      expect(await shardCount(shardPools[shard], created.data.announcementId)).toBe(counts[shard]);
    }
  }, 90000);

  it("a user with in-app notifications disabled receives no row", async () => {
    const hr = await hrLogin();
    const person = await makePerson(hr, "Ann Quiet");
    const off = await fetch(`${base}/api/v1/notifications/prefs`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${person.token}` },
      body: JSON.stringify({ email_enabled: false, in_app_enabled: false }),
    });
    expect(off.status).toBe(200);

    const create = await fetch(`${base}/api/v1/notifications/announcements`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
      body: JSON.stringify({ title: `Quiet announcement ${tag}`, body: "Should skip the quiet user." }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { data: { announcementId: string } };

    const homePool = shardPools[person.shard];
    const total = await waitStable(homePool, created.data.announcementId);
    expect(total).toBeGreaterThan(0);
    const mine = await homePool.query("SELECT 1 FROM notifications WHERE source_ref = $1 AND employee_id = $2", [created.data.announcementId, person.employeeId]);
    expect(mine.rows.length).toBe(0);
  }, 60000);

  it("EMPLOYEE cannot create announcements", async () => {
    const hr = await hrLogin();
    const person = await makePerson(hr, "Ann Blocked");
    const denied = await fetch(`${base}/api/v1/notifications/announcements`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${person.token}` },
      body: JSON.stringify({ title: "Rogue announcement", body: "nope" }),
    });
    expect(denied.status).toBe(403);
  }, 60000);
});
