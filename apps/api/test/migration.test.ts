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

async function adminToken(hr: string, suffix: string): Promise<string> {
  const email = `migboss${suffix}@hrms.local`;
  const create = await fetch(`${base}/api/v1/auth/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${hr}` },
    body: JSON.stringify({ email, role: "ADMIN" }),
  });
  expect(create.status).toBe(201);
  const { data } = (await create.json()) as { data: { token: string } };
  const accept = await fetch(`${base}/api/v1/auth/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: data.token, password: "MigBossPass1!" }),
  });
  return ((await accept.json()) as { data: { token: string } }).data.token;
}

async function waitRun(adm: string, runId: string): Promise<{ state: string; current_step: string; error: string }> {
  for (let i = 0; i < 100; i++) {
    const r = await fetch(`${base}/api/v1/admin/shards/runs/${runId}`, { headers: { authorization: `Bearer ${adm}` } });
    const body = (await r.json()) as { data: { state: string; current_step: string; error: string } };
    if (["COMPLETED", "ABORTED", "FAILED"].includes(body.data.state)) return body.data;
    await new Promise((r2) => setTimeout(r2, 2000));
  }
  throw new Error("migration did not finish");
}

describe("Phase 9 shard migration", () => {
  beforeAll(async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
  });

  it("preview guards, full shard-4 migration preserves every record", async () => {
    const hr = await hrLogin();
    const adm = await adminToken(hr, `${Date.now()}`);

    const denied = await fetch(`${base}/api/v1/admin/shards`, { headers: { authorization: `Bearer ${hr}` } });
    expect(denied.status).toBe(403);

    const shards = (await (await fetch(`${base}/api/v1/admin/shards`, { headers: { authorization: `Bearer ${adm}` } })).json()) as {
      data: { versions: Array<{ version: number; domain: string; members: string; active: boolean }> };
    };
    const activeEmp = shards.data.versions.find((v) => v.domain === "employee" && v.active);
    expect(activeEmp).toBeDefined();
    if (activeEmp!.members.split(",").includes("shard-4")) {
      const dir = (await (await fetch(`${base}/api/v1/employees?limit=100`, { headers: { authorization: `Bearer ${adm}` } })).json()) as { data: unknown[] };
      expect(dir.data.length).toBeGreaterThan(0);
      return;
    }

    const bogus = await fetch(`${base}/api/v1/admin/shards/preview`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${adm}` },
      body: JSON.stringify({ newShard: "postgres://evil" }),
    });
    expect(bogus.status).toBe(400);

    const preview = await fetch(`${base}/api/v1/admin/shards/preview`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${adm}` },
      body: JSON.stringify({ newShard: "shard-4" }),
    });
    expect(preview.status).toBe(200);
    const pv = (await preview.json()) as { data: { moves: number; movedBuckets: Array<{ bucket: number; to: string }> } };
    expect(pv.data.moves).toBeGreaterThan(0);
    const movedSet = new Set(pv.data.movedBuckets.filter((m) => m.to === "shard-4").map((m) => m.bucket));
    expect(movedSet.size).toBeGreaterThan(0);

    const dirBefore = (await (await fetch(`${base}/api/v1/employees?limit=100`, { headers: { authorization: `Bearer ${adm}` } })).json()) as { data: unknown[] };

    const migrate = await fetch(`${base}/api/v1/admin/shards/migrate`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${adm}` },
      body: JSON.stringify({ newShard: "shard-4" }),
    });
    expect(migrate.status).toBe(202);
    const { data: mg } = (await migrate.json()) as { data: { runId: string } };
    const final = await waitRun(adm, mg.runId);
    expect(final.state).toBe("COMPLETED");

    const after = (await (await fetch(`${base}/api/v1/admin/shards`, { headers: { authorization: `Bearer ${adm}` } })).json()) as {
      data: { versions: Array<{ version: number; domain: string; members: string; active: boolean }>; gates: Record<string, { state: string }> };
    };
    const nowActive = after.data.versions.find((v) => v.domain === "employee" && v.active);
    expect(nowActive!.members.split(",")).toContain("shard-4");
    for (const g of Object.values(after.data.gates)) expect(g.state).toMatch(/OPEN|UNREACHABLE/);

    const dirAfter = (await (await fetch(`${base}/api/v1/employees?limit=100`, { headers: { authorization: `Bearer ${adm}` } })).json()) as { data: unknown[] };
    expect(dirAfter.data.length).toBe(dirBefore.data.length);

    const abort = await fetch(`${base}/api/v1/admin/shards/runs/${mg.runId}/abort`, {
      method: "POST",
      headers: { authorization: `Bearer ${adm}` },
    });
    const abortBody = (await abort.json()) as { data: { reopened: boolean } };
    expect(abortBody.data.reopened).toBe(false);
  }, 240000);

  it("guards: unknown shard 400, already-member 400, abort unknown 400, abort terminal refused", async () => {
    const hr = await hrLogin();
    const adm = await adminToken(hr, `${Date.now()}-g`);

    const bogusPreview = await fetch(`${base}/api/v1/admin/shards/preview`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${adm}` },
      body: JSON.stringify({ newShard: "postgres://evil" }),
    });
    expect(bogusPreview.status).toBe(400);

    const bogusMigrate = await fetch(`${base}/api/v1/admin/shards/migrate`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${adm}` },
      body: JSON.stringify({ newShard: "nope" }),
    });
    expect(bogusMigrate.status).toBe(400);

    const shards = (await (await fetch(`${base}/api/v1/admin/shards`, { headers: { authorization: `Bearer ${adm}` } })).json()) as {
      data: { versions: Array<{ version: number; domain: string; members: string; active: boolean }>; runs: Array<{ run_id: string; state: string }> };
    };
    const activeEmp = shards.data.versions.find((v) => v.domain === "employee" && v.active);
    expect(activeEmp).toBeDefined();
    if (activeEmp!.members.split(",").includes("shard-4")) {
      const dupPreview = await fetch(`${base}/api/v1/admin/shards/preview`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${adm}` },
        body: JSON.stringify({ newShard: "shard-4" }),
      });
      expect(dupPreview.status).toBe(400);
      const dupMigrate = await fetch(`${base}/api/v1/admin/shards/migrate`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${adm}` },
        body: JSON.stringify({ newShard: "shard-4" }),
      });
      expect(dupMigrate.status).toBe(400);
    }

    const abortUnknown = await fetch(`${base}/api/v1/admin/shards/runs/does-not-exist/abort`, {
      method: "POST",
      headers: { authorization: `Bearer ${adm}` },
    });
    expect(abortUnknown.status).toBe(400);

    const terminal = shards.data.runs.find((r) => ["COMPLETED", "ABORTED", "FAILED"].includes(r.state));
    if (terminal) {
      const abortTerminal = await fetch(`${base}/api/v1/admin/shards/runs/${terminal.run_id}/abort`, {
        method: "POST",
        headers: { authorization: `Bearer ${adm}` },
      });
      expect(abortTerminal.status).toBe(200);
      const body = (await abortTerminal.json()) as { data: { reopened: boolean } };
      expect(body.data.reopened).toBe(false);
      const again = (await (await fetch(`${base}/api/v1/admin/shards/runs/${terminal.run_id}`, { headers: { authorization: `Bearer ${adm}` } })).json()) as {
        data: { state: string };
      };
      expect(again.data.state).toBe(terminal.state);
    }
  }, 60000);
});
