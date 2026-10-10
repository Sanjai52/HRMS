# Phase 1a Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Phase 1a walking skeleton: npm workspaces, Compose DB, ShardRouter ring, fenced writes, seed, login→dashboard→directory, full UI shell stubs.

**Architecture:** Express modular monolith + Next.js shell + shared core package. Backend built in strict PRD §36 dependency order; UI shell built in parallel against a frozen auth/directory contract with no Phase 2 pull-in.

**Tech Stack:** Node 22, npm workspaces, TypeScript strict, Express, Next.js App Router + Tailwind + shadcn/ui, pg, Argon2id (argon2), jsonwebtoken, Docker Compose (4 PG shards + pg-catalog), vitest.

**Spec:** PRD.md (v2.5, Phase 1a §36) + docs/decisions.md (D-001..D-008)

## Global Constraints

- Bucket count fixed at 256; hash = SHA256(lowercase-hyphenated-UUID UTF-8)[0:4 BE] mod 256.
- Ring V = 128; ring point = SHA256(shardId:i); bucket position = SHA256(bucket:N), first clockwise owner.
- Registry heartbeat 5s / TTL 30s / margin 10s; lease TTL 60s / renewal 10s / margin 15s; gate poll 250ms / ack 10s / fence 10s; access-token TTL 10min.
- Phase 1a: no Redis, no refresh sessions, no rate limiter, no outbox projection; directory from seed script; local-only login.
- Every employee-shard business write uses single ShardRouter fenced wrapper; CI bans direct pool access outside named exceptions.
- IDs serialized as strings in JSON; money as paise/integer (deferred to Phase 5, noted).
- Error envelope: {"success":false,"error":{"code","message","details"}} + request ID header.

---

### Task 1: Workspace + core package + CI guardrails

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `packages/core/package.json`, `packages/core/src/bucket.ts`, `packages/core/src/ring.ts`, `packages/core/src/errors.ts`, `packages/core/src/index.ts`
- Create: `scripts/check-direct-pool-access.sh`, `.github/workflows/ci.yml` (or `scripts/ci.sh` if no GitHub)
- Test: `packages/core/test/bucket.test.ts`, `packages/core/test/ring.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `stableEmployeeBucket(uuid: string): number`, `buildRing(members: string[], v: number): RingPoint[]`, `ownerOfBucket(bucket: number, ring): string`, `errorEnvelope(code, message, details?)`.

- [ ] **Step 1: Write failing bucket test**

```ts
// packages/core/test/bucket.test.ts
import { describe, it, expect } from "vitest";
import { stableEmployeeBucket } from "../src/bucket.js";
describe("stableEmployeeBucket", () => {
  it("is deterministic and in range", () => {
    const a = stableEmployeeBucket("123e4567-e89b-12d3-a456-426614174000");
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(256);
    expect(stableEmployeeBucket("123E4567-E89B-12D3-A456-426614174000")).toBe(a);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm --workspace @hrms/core test -- --run packages/core/test/bucket.test.ts`
Expected: FAIL with "Cannot find module" / not implemented.

- [ ] **Step 3: Minimal bucket + ring implementation**

```ts
// packages/core/src/bucket.ts
import { createHash } from "node:crypto";
export const BUCKET_COUNT = 256;
export function stableEmployeeBucket(uuid: string): number {
  const norm = uuid.toLowerCase();
  const digest = createHash("sha256").update(norm, "utf8").digest();
  return digest.readUInt32BE(0) % BUCKET_COUNT;
}
```

```ts
// packages/core/src/ring.ts
import { createHash } from "node:crypto";
export interface RingPoint { hash: bigint; shardId: string; }
const h = (s: string): bigint => BigInt("0x" + createHash("sha256").update(s, "utf8").digest("hex"));
export function buildRing(members: string[], v: number): RingPoint[] {
  const pts: RingPoint[] = [];
  for (const m of members) for (let i = 0; i < v; i++) pts.push({ hash: h(`${m}:${i}`), shardId: m });
  return pts.sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));
}
export function ownerOfBucket(bucket: number, ring: RingPoint[]): string {
  const bh = h(`bucket:${bucket}`);
  for (const p of ring) if (p.hash >= bh) return p.shardId;
  return ring[0].shardId;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm --workspace @hrms/core test -- --run`
Expected: PASS.

- [ ] **Step 5: Add direct-pool-access lint script + wire CI**

```bash
# scripts/check-direct-pool-access.sh — fail on `new Pool(` or `from "pg"` outside allow-list:
# allow: packages/core/src/shard-router.ts, apps/api/src/db/*, infrastructure/postgres/*, tests/**, benchmark control
```

### Task 2: Compose DB + migration runner

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `infrastructure/postgres/runner.mjs`, `infrastructure/postgres/migrations/001_init.sql`, `infrastructure/postgres/migrations/002_gates.sql`
- Test: `tests/integration/migration.test.ts` (connects to each shard, checks schema_migrations + shard_write_gate exists)

**Interfaces:**
- Consumes: Task 1 workspace.
- Produces: `DATABASE_SHARD_1..4_URL`, `CATALOG_DATABASE_URL`; `001` creates catalog tables (users, employee_directory, routing_map_versions, routing_map_buckets, worker_id_leases, process_registry, audit_logs) + shard tables (employees, shard_write_gate, schema_migrations); `002` adds gates/indexes.

- [ ] **Step 1: Write failing migration test (expects gate table)**

```ts
import { describe, it, expect } from "vitest";
// connect to SHARD_1_URL, SELECT state FROM shard_write_gate → expect "OPEN"
```

- [ ] **Step 2: Run, verify fail (no DB / no table).**
- [ ] **Step 3: Write compose (shard-1..4 + pg-catalog, core profile) + runner that applies migrations in order to all 5 URLs with advisory-lock-free single-owner note + version verify.**
- [ ] **Step 4: `docker compose --profile core up -d`, run runner, re-run test → PASS.**

### Task 3: ShardRouter + materialized map + golden vectors

**Files:**
- Create: `packages/core/src/shard-router.ts`, `packages/core/test/golden-vectors.test.ts`, `packages/core/test/map-equality.test.ts`
- Modify: `apps/api/src/db/pools.ts` (pool factory only; no domain imports of pg)

**Interfaces:**
- Consumes: bucket.ts, ring.ts.
- Produces: `resolveShard(employeeId, activeMap): ShardId`, `loadActiveMap(catalogPool): Promise<Map<number,string>>`, `withFencedWrite(pool, fn)` (Task 4 extends with gate check).

- [ ] **Step 1: Golden-vector test with 3 fixed UUID→bucket pairs (values computed from implementation, checked in, never changed without decision).**
- [ ] **Step 2: Map-equality test: materialized routing_map_buckets == ring output for version.**
- [ ] **Step 3: Implement pools + loader + resolver; seed map v1 for shards 1-3 via ring.**

### Task 4: Fence + ownership manifest

**Files:**
- Create: `docs/shard-owned-tables.md`, `tests/integration/gate.test.ts`
- Modify: `packages/core/src/shard-router.ts` (add `withFencedWrite`: `SELECT pg_advisory_xact_lock(hashtext(shard))` or `pg_advisory_xact_lock` + `SELECT state FROM shard_write_gate` then fn; throw `GATE_CLOSED_503` when GATED)

**Interfaces:**
- Consumes: Task 3 resolver.
- Produces: `withFencedWrite<T>(shardPool, fn): Promise<T>`; manifest rows: table, domain, owner key, bucket col, copy order, checksum cols, excluded flag.

- [ ] **Step 1: Gate test: set shard-1 gate GATED → expect withFencedWrite rejects with 503 code; set OPEN → passes.**
- [ ] **Step 2: Implement fence; manifest lists employees(+attendance/leave/payroll/performance placeholders with excluded=true until their phases).**
- [ ] **Step 3: CI check: manifest completeness (every migration table with employee_id present in manifest).**

### Task 5: Leases/registry + seed + auth slice

**Files:**
- Create: `apps/api/src/auth/password.ts` (argon2), `apps/api/src/auth/token.ts` (JWT 10min), `apps/api/src/routes/auth.ts` (`POST /api/v1/auth/login`), `apps/api/src/routes/employees.ts` (`GET /api/v1/employees` from catalog directory, RBAC HR/ADMIN + self), `apps/api/src/middleware/auth.ts`, `apps/api/src/index.ts`, `infrastructure/postgres/seed.mjs`
- Test: `tests/integration/auth.test.ts` (seeded HR login → 200 + token; wrong pw → 401; directory with token → 200 rows; without token → 401)

**Interfaces:**
- Consumes: pools, active-map loader.
- Produces: `POST /api/v1/auth/login {email,password} → {success:true,data:{token,expiresIn}}`; `GET /api/v1/employees?q=` → directory rows.

- [ ] **Step 1: Auth test as above (fails, no server).**
- [ ] **Step 2: Seed script: HR user argon2 hash, departments/designations/leave-policy/holiday, 5 employees with canonical bucket + shard recorded, directory projection rows.**
- [ ] **Step 3: Implement auth middleware (Bearer JWT verify, attach user) + login (argon2.verify) + directory read; no Redis/refresh/rate-limit.**
- [ ] **Step 4: Run seed + tests → PASS.**

### Task 6: Web shell + wiring + exit verify

**Files:**
- Create: `apps/web/` Next.js app: `app/page.tsx` (landing), `app/login/page.tsx`, `app/dashboard/page.tsx`, `app/hr/employees/page.tsx`, `components/app-shell.tsx` (topbar + collapsible sidebar + drawer), `lib/api.ts` (fetch wrapper with token + envelope handling), middleware for route guard (UX only)
- Create: `docs/superpowers/plans/` exit checklist + `scripts/exit-1a.sh` (compose up → migrate → seed → api boot → login → dashboard fetch → directory fetch)

**Interfaces:**
- Consumes: Task 5 API contract.
- Produces: working local demo on `localhost:3000` via Next.js → `localhost:4000` API.

- [ ] **Step 1: Web build test: `npm --workspace @hrms/web run build` passes; login page posts to API and stores token in memory.**
- [ ] **Step 2: Implement shell + 4 wired pages + stub routes for remaining sidebar items (empty states).**
- [ ] **Step 3: Run exit script end-to-end; record result in plan.**

## Self-Review

- Spec coverage: Phase 1a steps 1-8 each have a task; D-001..D-008 values embedded as constraints. Phase 1b/2 items explicitly excluded.
- No placeholders: every step names exact file + runnable command + expected outcome.
- Type consistency: `stableEmployeeBucket`, `ownerOfBucket`, `withFencedWrite`, API envelope shapes reused across tasks.
