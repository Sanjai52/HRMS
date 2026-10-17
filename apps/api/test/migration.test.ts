import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { MIGRATION_MANIFEST } from "@hrms/core";

const base = process.env.API_BASE ?? "http://localhost:4000";

// The migration below cuts the employee map over to shard-4. Owned shards are
// 1-3 (routes skip shard-4), so leaving that map active poisons every test file
// that runs afterwards, and a later run would re-copy buckets over copies that
// changed since, failing the checksum verify. Restore the pre-migration state:
// reactivate the old map, delete the shard-4 copies it does not own, reopen
// gates.
let restoreActiveVersion: number | null = null;

afterAll(async () => {
  const catalogUrl = process.env.CATALOG_DATABASE_URL;
  if (catalogUrl && restoreActiveVersion !== null) {
    const catalog = new Pool({ connectionString: catalogUrl });
    try {
      await catalog.query("UPDATE routing_map_versions SET active = (version = $1) WHERE domain = 'employee'", [restoreActiveVersion]);
      await catalog.query("UPDATE catalog_write_gate SET state = 'OPEN' WHERE id = 1");
      const strays = await catalog.query("SELECT bucket_id FROM routing_map_buckets WHERE version = $1 AND shard_id <> 'shard-4'", [restoreActiveVersion]);
      const strayBuckets = strays.rows.map((r) => (r as { bucket_id: number }).bucket_id);
      const strayUrl = process.env.DATABASE_SHARD_4_URL;
      if (strayBuckets.length > 0 && strayUrl) {
        const strayPool = new Pool({ connectionString: strayUrl });
        try {
          for (const t of MIGRATION_MANIFEST) {
            await strayPool.query(`DELETE FROM ${t.table} WHERE bucket_id = ANY($1)`, [strayBuckets]);
          }
        } finally {
          await strayPool.end();
        }
      }
    } finally {
      await catalog.end();
    }
  }
  for (let n = 1; n <= 4; n++) {
    const shardUrl = process.env[`DATABASE_SHARD_${n}_URL`];
    if (!shardUrl) continue;
    const shard = new Pool({ connectionString: shardUrl });
    try {
      await shard.query("UPDATE shard_write_gate SET state = 'OPEN' WHERE id = 1");
    } catch {
      // best-effort cleanup; a missing gate table must not mask test results
    } finally {
      await shard.end();
    }
  }
});

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
    restoreActiveVersion = activeEmp!.version;
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
