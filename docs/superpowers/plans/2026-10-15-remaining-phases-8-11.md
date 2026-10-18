# Remaining Phases 8-11 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land uncommitted Phase 8/9/10 work and close local evaluation so `docs/status.md` shows DONE through Phase 10.

**Architecture:** Keep Express modular monolith + BullMQ worker + 4 PG shards + `pg-catalog` + 2 Redis. No new infra. Finish fenced `ShardRouter` writes, versioned ring maps, outbox dispatcher, and measured-only `docs/evaluation.md`.

**Tech Stack:** Node >=22, Express, pg, BullMQ, Redis, Postgres, k6 v2.2.0, Playwright, Vitest, Next.js App Router Tailwind v4.

**Spec:** `PRD.md` v2.5 §§9.2/9.3/9.5/9.8, Phases 8-10 `PRD.md:2352-2381`, `docs/decisions.md` D-001..D-008, `docs/shard-owned-tables.md`, `docs/experiments/00-method.md`.

## Global Constraints

- Node `>=22` per `package.json:18`.
- Bucket `bucket_id = SHA256(lowercase-hyphenated-UUID UTF-8)[first 4 bytes BE] mod 256`, count fixed `256` for v1.
- Ring: point `SHA256(shardId + ":" + i)`, bucket pos `SHA256("bucket:" + bucket_id)`, `V = 128`.
- Registry: heartbeat `5s`, TTL `30s`, stop-write margin `10s` — cutoff `~20s` after last send.
- Lease: TTL `60s`, renew `10s`, margin `15s` — stop-gen `~45s` after last renew.
- Gate poll `250ms`, ack timeout `10s`, fence timeout `10s` per attempt.
- Access-token TTL `10 minutes`.
- Migrations `NNN_name.sql` immutable once run; new change = new NNN file.
- 64-bit IDs as decimal strings in JSON, never JS Number.
- `ShardRouter` is only writer to shards; CI bans direct pool access outside named exceptions.
- Measured results only in `docs/evaluation.md`; no invented numbers.
- Phase 1a login local-only, no rate-limiter bypass in prod; k6 bypass `RATE_LIMIT_BYPASS_IPS` test-only default empty.

## Review Focus

- Gated write during migration returns `503 GATE_CLOSED` not silent success — test stale writer blocked.
- Manager viewing non-team goals/reviews gets `403`, not empty list leaking existence.
- Re-running crawler/sourcing with same fixtures imports `0` new candidates.
- Short `/s/:code` for off-allow-list destination rejected, unknown code `404` not redirect.
- Burst + catalog/shard outage surfaces `partial:true` or explicit `503`, never cross-shard fallback write.

---

### Task 1: Phase 8 — Performance + Reports hardening

**Files:**
- Modify: `apps/api/src/routes/performance.ts:29-298`, `apps/api/src/routes/reports.ts:8-70`, `apps/api/src/index.ts`
- Modify: `infrastructure/postgres/migrations/013_catalog_perf_config.sql`, `014_shard_perf.sql`, `015_shard_outbox_review.sql`
- Modify: `apps/web/app/hr/performance/page.tsx`, `apps/web/app/hr/performance/cycles/page.tsx`, `apps/web/app/manager/performance/page.tsx`, `apps/web/app/manager/performance/[employeeId]/page.tsx`, `apps/web/app/performance/page.tsx`, `apps/web/app/hr/reports/page.tsx`
- Test: `apps/api/test/performance.test.ts`

**Interfaces:**
- Consumes: `shardFor(employeeId)`, `ownedBuckets()`, `selfEmployeeId(req)`, `withFencedWrite(pool, fn)`, `nextEventId(): string`
- Produces: `GET/POST /api/v1/performance/cycles`, `GET/POST/PATCH /goals`, `POST /reviews`, `POST /reviews/:id/submit|release`, `GET /reviews/me|/team|/summary`, `GET /api/v1/reports/overview`

- [ ] **Step 1: Run existing performance test to find gaps**

Run: `CATALOG_DATABASE_URL=postgres://hrms:hrms@localhost:5438/hrms_catalog DATABASE_SHARD_1_URL=postgres://hrms:hrms@localhost:5439/hrms_shard1 DATABASE_SHARD_2_URL=postgres://hrms:hrms@localhost:5440/hrms_shard2 DATABASE_SHARD_3_URL=postgres://hrms:hrms@localhost:5441/hrms_shard3 DATABASE_SHARD_4_URL=postgres://hrms:hrms@localhost:5442/hrms_shard4 API_BASE=http://localhost:4000 npm --workspace @hrms/api run test -- --run test/performance.test.ts --no-file-parallelism`
Expected: PASS or list failures to fix in Step 3

- [ ] **Step 2: Add missing RBAC/outbox assertions if gaps found**

In `apps/api/test/performance.test.ts` assert: self-review `403 SELF_REVIEW`, non-manager goal create `403`, HR release creates `REVIEW_RELEASED` outbox + notification, `GET /summary` counts match seeded cycle.
Expected: new assertions FAIL until code fixed

- [ ] **Step 3: Fix `performance.ts` gaps only**

Ensure: `canManage()` checks `manager_id` on owning shard, `POST /goals` requires ACTIVE cycle in catalog, `PATCH /goals/:id` skips `shard-4`, `POST /reviews/:id/release` uses `withFencedWrite` + `GateClosedError→503`. No direct `shardPools` writes outside fence for mutating routes.
Expected: Step 1 suite green

- [ ] **Step 4: Verify typecheck + lint + pool guard**

Run: `npm run typecheck && npm run lint && npm run check:pool-access`
Expected: PASS

- [ ] **Step 5: Commit Phase 8**

```bash
git add apps/api/src/routes/performance.ts apps/api/src/routes/reports.ts infrastructure/postgres/migrations/013* infrastructure/postgres/migrations/014* infrastructure/postgres/migrations/015* apps/web/app/hr/performance apps/web/app/manager/performance apps/web/app/performance apps/web/app/hr/reports apps/api/test/performance.test.ts docs/shard-owned-tables.md
git commit -m "Phase 8: performance reviews, cycles, reports"
```

### Task 2: Phase 9 — Migration control plane + Admin UI

**Files:**
- Modify: `apps/api/src/migration/runner.ts:199-298`, `packages/core/src/migration.ts:10-37`, `apps/api/src/registry.ts:15-41`, `apps/api/src/catalog-gate.ts`, `apps/api/src/routes/admin.ts`
- Modify: `infrastructure/postgres/migrations/016_catalog_migration.sql`
- Modify: `apps/web/app/admin/shards/page.tsx`, `apps/web/app/admin/audit-logs/page.tsx`, `apps/web/app/admin/system-health/page.tsx`
- Test: `apps/api/test/migration.test.ts`

**Interfaces:**
- Consumes: `computeMap(members)`, `diffMaps(old,new)`, `MIGRATION_MANIFEST`, `loadActiveMap(catalogPool)`
- Produces: `previewNewShard(shard)->Preview`, `startMigration(shard,actor)->runId`, `abortRun(runId,actor)`, `GET/POST /api/v1/admin/shards/*`, `GET /api/v1/admin/shards/runs/:id`

- [ ] **Step 1: Run migration test (needs live stack)**

Run: `API_BASE=http://localhost:4000 npm --workspace @hrms/api run test -- --run test/migration.test.ts --no-file-parallelism`
Expected: `COMPLETED` with `64 buckets, 134 rows` per `docs/evaluation.md:31` or explicit FAIL to fix

- [ ] **Step 2: Harden pre-copy abort + post-cutover guard**

In `apps/api/src/migration/runner.ts` assert: `abortRun` CAS-reopens only same-epoch `GATED→OPEN`, refuses when `current_step` in `COPYING/VERIFYING/CUTOVER_COMMITTED/ACKED/WRITES_RESUMED`, keeps gates closed on verify mismatch. Add test for unknown-shard `400` + already-member `400`.
Expected: FAIL before fix, PASS after

- [ ] **Step 3: Fix registry/gate wiring in `index.ts`**

Ensure `registerProcess("API", owner)` before listen, `catalog_write_gate` checked in same txn for catalog mutations, shard gates `GATED` block via `withFencedWrite→503`. Admin routes `requireRoles("ADMIN")` + `writeAudit`.
Expected: migration test green

- [ ] **Step 4: Verify pool guard + core tests**

Run: `npm --workspace @hrms/core test -- --run && npm run check:pool-access`
Expected: `bucket 1/1, ring 1/1, golden 1/1, map-equality 1/1` + guard PASS

- [ ] **Step 5: Commit Phase 9**

```bash
git add apps/api/src/migration apps/api/src/registry.ts apps/api/src/catalog-gate.ts apps/api/src/routes/admin.ts packages/core/src/migration.ts infrastructure/postgres/migrations/016* apps/web/app/admin apps/api/test/migration.test.ts
git commit -m "Phase 9: shard-add migration, registry, admin shards"
```

### Task 3: Phase 10a — Load + bench harness + raw runs

**Files:**
- Modify: `tests/load/mixed.js`, `tests/load/burst.js`, `tests/load/ratelimit.js`, `tests/load/smoke.js`, `tests/bench/ring-bench.mjs`, `tests/bench/suggest-bench.mjs`, `tests/bench/fence-bench.mjs`
- Modify: `infrastructure/postgres/seed-demo.cjs`, `docs/experiments/00-method.md`
- Test: manual k6 outputs in `docs/experiments/raw/`

**Interfaces:**
- Consumes: `POST /api/v1/auth/login`, `GET /api/v1/employees`, `GET /api/v1/search/suggest`
- Produces: `docs/experiments/raw/mixed-{low,medium,high}-r{1,2,3}.txt`, `burst-*.txt`, `ratelimit-*.txt`, `bench-*.txt`

- [ ] **Step 1: Verify existing raw completeness**

Run: `ls docs/experiments/raw/ | sort`
Expected: has `mixed-low/medium/high r1-3` + `matrix.done`; missing `burst`, `ratelimit`, `bench` outputs = work for Step 2

- [ ] **Step 2: Run missing profiles 3x warmed**

Run: `k6 run --env API=http://localhost:4000 --env PROFILE=low tests/load/mixed.js > docs/experiments/raw/mixed-low-r1.txt` (repeat per profile/run), plus `tests/load/burst.js`, `tests/load/ratelimit.js`, `node tests/bench/ring-bench.mjs`, `node tests/bench/suggest-bench.mjs`, `node tests/bench/fence-bench.mjs`
Expected: JSON summaries with `p50/p95/p99`, no `http_req_failed rate>0.05` for low/medium

- [ ] **Step 3: Commit raw evidence only**

```bash
git add tests/load tests/bench docs/experiments/00-method.md docs/experiments/raw infrastructure/postgres/seed-demo.cjs
git commit -m "Phase 10a: k6 and bench raw outputs"
```

### Task 4: Phase 10b — Evaluation + failure scenarios + status

**Files:**
- Modify: `docs/evaluation.md:6-34`, `docs/status.md:81-85`, `docs/decisions.md:61-63`
- Modify: `apps/web/e2e/hrms.spec.ts`, `apps/web/playwright.config.ts`
- Test: `npx playwright test` in `apps/web`

**Interfaces:**
- Consumes: `docs/experiments/raw/*.txt`, `/metrics`, Prometheus `:9090`, Grafana `:3001`
- Produces: filled workload table (median[range] p95/p99, never averaged), failure table, traceability rows

- [ ] **Step 1: Parse raw into evaluation table**

Run: `python3 -c "import json,glob; print([open(f).read()[:500] for f in glob.glob('docs/experiments/raw/mixed-*.txt')][:2])"`
Expected: extract `p50/p95/p99/throughput/errors` per run; fill `docs/evaluation.md` Low/Med/High + burst rows, leave `—` where not run (do not invent)

- [ ] **Step 2: Run + record failure scenarios**

Run API kill+NGINX `:8080/health`, shard-2 stop + scatter `partial` check, catalog stop + fail-closed login vs fail-open search check. Record outcome in `docs/evaluation.md:27-34`.
Expected: each row has measured outcome or `—` with reason

- [ ] **Step 3: Run Playwright E2E**

Run: `npm --workspace @hrms/web run e2e` or `npx playwright test --project=chromium`
Expected: 11 specs in `hrms.spec.ts:4-152` PASS (landing, login, invite, lifecycle, attendance, leave, payroll, hiring, sourcing, performance, admin)

- [ ] **Step 4: Update status tracker**

In `docs/status.md` append `Phase 8 DONE`, `Phase 9 DONE`, `Phase 10 DONE` with dates + test counts + `evaluation.md` links. Keep `Phases 11: NOT STARTED (P2 AWS, optional)`.
Expected: `git diff docs/status.md` shows 3 new sections

- [ ] **Step 5: Commit Phase 10**

```bash
git add docs/evaluation.md docs/status.md docs/decisions.md apps/web/e2e
git commit -m "Phase 10: evaluation, failure scenarios, e2e"
```

### Task 5: Final verification + push ready

**Files:**
- Touch: none (verify only)

- [ ] **Step 1: Full CI**

Run: `npm run ci`
Expected: `typecheck PASS, lint PASS, check:pool-access PASS, core 7/7+ PASS, api 28/28+ PASS (serial --no-file-parallelism), web build PASS`

- [ ] **Step 2: Tag DONE**

No code; confirm `git status --short` clean except intended Phase 11 deferral.
Expected: ready to push / PR

---

## Self-Review

1. Spec coverage: FR-12→Task1, NFR-MIG→Task2, NFR-EVAL→Tasks3-4, P2 AWS explicitly deferred per PRD §8.1 (P2 must not delay local demo). No gap.
2. Step scan: each step one command + expected output; no TBD.
3. Type consistency: `runId:string`, `Preview{fromVersion,toVersion,members,moves}`, `BucketMove{bucket,from,to}` reused across Task2 steps.
4. Review Focus tests added in Task1-Step2, Task2-Step2, Task4-Step2.
5. Proportion: plan ~1/20th of PRD, signatures only, no bodies transcribed.
