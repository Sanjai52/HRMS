import {
  HttpCrawler,
  parseListingIds,
  hasNextPage,
  parseProfile,
  normalizeEmail,
  fingerprint,
  stableEmployeeBucket,
  loadMapByDomain,
  type Queryable,
  type PoolLike,
} from "@hrms/core";

export interface CrawlHandles {
  catalog: Queryable;
  shards: Record<string, PoolLike>;
  portalBase: string;
  nextId: () => string;
}

const PAGE_TIMEOUT = 8000;
const MAX_LISTINGS = 10;
const CONCURRENCY = 2;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return fn();
  }
}

export async function runCrawlRun(handles: CrawlHandles, runId: string): Promise<{ discovered: number; imported: number; errors: number; pages: number }> {
  const r = await handles.catalog.query("SELECT role, skills FROM crawl_runs WHERE run_id = $1", [runId]);
  if (r.rows.length === 0) throw new Error(`unknown-run:${runId}`);
  const wanted = new Set(((r.rows[0] as { skills: string[] }).skills ?? []).map((s) => s.toLowerCase()));
  await handles.catalog.query("UPDATE crawl_runs SET status = 'RUNNING' WHERE run_id = $1", [runId]);

  const { map } = await loadMapByDomain(handles.catalog, "candidate");
  const crawler = new HttpCrawler(handles.portalBase);
  const seen = new Set<string>();
  let discovered = 0;
  let imported = 0;
  let errors = 0;
  let pages = 0;

  async function claim(key: string, fallbackId: string): Promise<{ candidateId: string; fresh: boolean }> {
    const ins = await handles.catalog.query("INSERT INTO candidate_email_claims (email_norm, candidate_id) VALUES ($1, $2) ON CONFLICT (email_norm) DO NOTHING RETURNING candidate_id", [key, fallbackId]);
    if (ins.rows.length > 0) return { candidateId: fallbackId, fresh: true };
    const ex = await handles.catalog.query("SELECT candidate_id FROM candidate_email_claims WHERE email_norm = $1", [key]);
    return { candidateId: (ex.rows[0] as { candidate_id: string }).candidate_id, fresh: false };
  }

  async function importProfile(sourceId: string, url: string): Promise<void> {
    let page;
    try {
      page = await withRetry(() => crawler.fetch(url, PAGE_TIMEOUT));
    } catch (e) {
      errors += 1;
      await handles.catalog.query("INSERT INTO crawl_pages (run_id, url, status, error) VALUES ($1,$2,0,$3) ON CONFLICT DO NOTHING", [runId, url, String((e as Error).message).slice(0, 200)]);
      return;
    }
    if (page.status !== 200) {
      errors += 1;
      await handles.catalog.query("INSERT INTO crawl_pages (run_id, url, status, error) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [runId, url, page.status, `http-${page.status}`]);
      return;
    }
    const raw = parseProfile(page.body, sourceId);
    if (!raw) {
      errors += 1;
      await handles.catalog.query("INSERT INTO crawl_pages (run_id, url, status, error) VALUES ($1,$2,200,$3) ON CONFLICT DO NOTHING", [runId, url, "unparseable"]);
      return;
    }
    if (wanted.size > 0 && !raw.skills.some((s) => wanted.has(s))) return;
    discovered += 1;
    const email = normalizeEmail(raw.email);
    const key = email ?? fingerprint(raw);
    const fallbackId = `cand-${handles.nextId()}`;
    const { candidateId, fresh } = await claim(key, fallbackId);
    if (!fresh) return;
    const bucket = stableEmployeeBucket(candidateId);
    const shard = map.get(bucket);
    const pool = shard ? handles.shards[shard] : undefined;
    if (!pool) {
      errors += 1;
      return;
    }
    const client = await pool.connect();
    try {
      await client.query(
        "INSERT INTO candidates (candidate_id, candidate_bucket_id, name, email, phone, skills, experience_years, resume_key, source) VALUES ($1,$2,$3,$4,$5,$6,$7,'',$8) ON CONFLICT DO NOTHING",
        [candidateId, bucket, raw.name, email ?? "", raw.phone.slice(0, 30), raw.skills, raw.expYears, email ? "portal" : "portal-unverified"]
      );
      imported += 1;
    } finally {
      client.release();
    }
  }

  let pageNum = 1;
  let more = true;
  while (more && pageNum <= MAX_LISTINGS) {
    const url = `/listings?page=${pageNum}`;
    let page;
    try {
      page = await withRetry(() => crawler.fetch(url, PAGE_TIMEOUT));
    } catch (e) {
      errors += 1;
      await handles.catalog.query("INSERT INTO crawl_pages (run_id, url, status, error) VALUES ($1,$2,0,$3) ON CONFLICT DO NOTHING", [runId, url, String((e as Error).message).slice(0, 200)]);
      break;
    }
    pages += 1;
    await handles.catalog.query("INSERT INTO crawl_pages (run_id, url, status) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [runId, url, page.status]);
    if (page.status !== 200) {
      errors += 1;
      break;
    }
    const ids = parseListingIds(page.body).filter((id) => !seen.has(id));
    ids.forEach((id) => seen.add(id));
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      await Promise.all(ids.slice(i, i + CONCURRENCY).map((id) => importProfile(id, `/profiles/${id}`)));
    }
    more = hasNextPage(page.body);
    pageNum += 1;
  }

  const status = pages === 0 ? "FAILED" : errors > 0 && imported === 0 ? "PARTIAL_FAILED" : "COMPLETED";
  await handles.catalog.query("UPDATE crawl_runs SET status = $2, pages = $3, discovered = $4, imported = $5, errors = $6, finished_at = now() WHERE run_id = $1", [runId, status, pages, discovered, imported, errors]);
  return { discovered, imported, errors, pages };
}
