import { Redis } from "ioredis";

async function main() {
  const base = process.env.API_BASE ?? "http://localhost:4000";
  const login = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "hr@hrms.local", password: "ChangeMe123!" }),
  });
  const { data } = await login.json();
  const h = { authorization: `Bearer ${data.token}` };
  const redis = new Redis(process.env.REDIS_KV_URL ?? "redis://localhost:6380", { maxRetriesPerRequest: 3 });
  const queries = ["aar", "eng", "pri", "des", "sal", "ana", "rah", "kaa"];
  const iters = Number(process.env.ITERS ?? 60);
  // GAP_MS paces requests to stay under the suggest rate limit (60/min/user,
  // continuous refill ~1 token/s). Default 0 = unpaced. Needed because the
  // test-only RATE_LIMIT_BYPASS_IPS cannot be toggled without restarting the API.
  const gapMs = Number(process.env.GAP_MS ?? 0);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function bustCache() {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", "autocomplete:org:all:*", "COUNT", 200);
      cursor = next;
      if (keys.length > 0) await redis.unlink(...keys);
    } while (cursor !== "0");
  }

  async function measure(q) {
    if (gapMs > 0) await sleep(gapMs);
    const t0 = process.hrtime.bigint();
    const r = await fetch(`${base}/api/v1/search/suggest?q=${encodeURIComponent(q)}`, { headers: h });
    const body = await r.json();
    return { ms: Number(process.hrtime.bigint() - t0) / 1e6, source: body.meta?.source ?? "?", n: (body.data ?? []).length };
  }

  const cold = [];
  for (let i = 0; i < iters; i++) {
    await bustCache();
    cold.push(await measure(queries[i % queries.length]));
  }
  for (let i = 0; i < iters; i++) await measure(queries[i % queries.length]);
  const warm = [];
  for (let i = 0; i < iters; i++) warm.push(await measure(queries[i % queries.length]));

  const stat = (ds) => {
    const s = ds.map((d) => d.ms).sort((a, b) => a - b);
    const q = (p) => Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] * 100) / 100;
    return { count: s.length, p50: q(50), p95: q(95), sources: [...new Set(ds.map((d) => d.source))], avgResults: Math.round(ds.reduce((a, d) => a + d.n, 0) / ds.length * 10) / 10 };
  };
  console.log(JSON.stringify({ baselineIndexedCatalog: stat(cold), redisPrefixCache: stat(warm) }, null, 1));
  redis.disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
