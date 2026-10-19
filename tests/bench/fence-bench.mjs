import { Pool } from "pg";
import { withFencedWrite } from "@hrms/core";

async function quantile(rows, ms) {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < rows; i++) await ms();
  const t1 = process.hrtime.bigint();
  return Number(t1 - t0) / 1e6 / rows;
}

function stats(ds) {
  const s = [...ds].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  return { p50: Math.round(q(50) * 100) / 100, p95: Math.round(q(95) * 100) / 100, count: s.length };
}

async function time(pool, fn, iters) {
  const ds = [];
  for (let i = 0; i < iters; i++) {
    const t0 = process.hrtime.bigint();
    await fn(pool);
    ds.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  return stats(ds);
}

async function main() {
  const runs = Number(process.env.RUNS ?? 3);
  const iters = Number(process.env.ITERS ?? 200);
  const pool = new Pool({ connectionString: process.env.DATABASE_SHARD_1_URL, max: 5 });
  await pool.query("CREATE TABLE IF NOT EXISTS bench_probe (id INT PRIMARY KEY, v INT NOT NULL DEFAULT 0)");
  await pool.query("INSERT INTO bench_probe (id, v) VALUES (1, 0) ON CONFLICT DO NOTHING");
  const out = [];
  for (let r = 0; r < runs; r++) {
    const fenced = await time(pool, (p) => withFencedWrite(p, (c) => c.query("UPDATE bench_probe SET v = v + 1 WHERE id = 1")), iters);
    const bare = await time(pool, async (p) => {
      const c = await p.connect();
      try {
        await c.query("BEGIN");
        await c.query("UPDATE bench_probe SET v = v + 1 WHERE id = 1");
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK").catch(() => undefined);
        throw e;
      } finally {
        c.release();
      }
    }, iters);
    out.push({ run: r + 1, fencedMs: fenced, bareMs: bare, overheadPct: Math.round(((fenced.p50 - bare.p50) / bare.p50) * 1000) / 10 });
  }
  console.log(JSON.stringify({ operation: "single-row UPDATE on shard-1 (bench_probe)", iters, runs: out }, null, 1));
  await pool.query("DROP TABLE bench_probe");
  await pool.end();
  void quantile;
}
main().catch((e) => { console.error(e.message); process.exit(1); });
