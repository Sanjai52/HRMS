import { randomBytes } from "node:crypto";
import { buildRing, ownerOfBucket, VIRTUAL_NODES } from "./ring.js";
import { BUCKET_COUNT } from "./bucket.js";
import type { Queryable } from "./shard-router.js";

export const CANDIDATE_SHARDS = ["shard-1", "shard-2", "shard-3"] as const;

export const STAGES = ["APPLIED", "SCREENING", "SHORTLISTED", "ASSESSMENT", "INTERVIEW", "SELECTED"] as const;
export const TERMINAL = ["REJECTED", "WITHDRAWN"] as const;

const NEXT: Record<string, string[]> = {
  APPLIED: ["SCREENING", "REJECTED", "WITHDRAWN"],
  SCREENING: ["SHORTLISTED", "REJECTED", "WITHDRAWN"],
  SHORTLISTED: ["ASSESSMENT", "INTERVIEW", "REJECTED", "WITHDRAWN"],
  ASSESSMENT: ["INTERVIEW", "REJECTED", "WITHDRAWN"],
  INTERVIEW: ["SELECTED", "REJECTED", "WITHDRAWN"],
  SELECTED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export function canTransition(from: string, to: string): boolean {
  return (NEXT[from] ?? []).includes(to);
}

export function slugify(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "role";
}

const B62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function randomCode(length = 7): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) out += B62[b % 62];
  return out;
}

export function isAllowedDestination(dest: string): boolean {
  return dest === "/jobs" || dest.startsWith("/jobs/");
}

export async function loadMapByDomain(catalog: Queryable, domain: string): Promise<{ version: number; map: Map<number, string> }> {
  const v = await catalog.query("SELECT version FROM routing_map_versions WHERE domain = $1 AND active = TRUE ORDER BY version DESC LIMIT 1", [domain]);
  if (v.rows.length === 0) throw new Error(`no-active-routing-map:${domain}`);
  const version = v.rows[0].version as number;
  const r = await catalog.query("SELECT bucket_id, shard_id FROM routing_map_buckets WHERE version = $1", [version]);
  const map = new Map<number, string>();
  for (const row of r.rows) map.set(row.bucket_id as number, row.shard_id as string);
  if (map.size !== BUCKET_COUNT) throw new Error(`incomplete-routing-map:${map.size}`);
  return { version, map };
}

export function buildCandidateMapV1(members: string[] = [...CANDIDATE_SHARDS], v: number = VIRTUAL_NODES): Array<{ bucket: number; shard: string }> {
  const ring = buildRing(members, v);
  const rows: Array<{ bucket: number; shard: string }> = [];
  for (let b = 0; b < BUCKET_COUNT; b++) rows.push({ bucket: b, shard: ownerOfBucket(b, ring) });
  return rows;
}
