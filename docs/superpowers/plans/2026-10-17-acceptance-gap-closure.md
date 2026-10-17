# Acceptance-Gap Closure Plan (Phases 8–10 close-out + PRD §34 gap fixes)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the in-flight Phase 10b work, close the local evaluation evidence (Phases 8–10), then fix every remaining PRD v2.5 §34 acceptance gap found in the 2026-10-17 gap audit — enforcement first, functional second, infra third, docs last. Phase 11 (AWS/cloud) stays out of scope, as the PRD allows.

**Architecture:** No new architecture. All work stays inside the existing Express modular monolith + BullMQ worker + 4 PostgreSQL shards + `pg-catalog` + 2 Redis + NGINX stack, behind the existing fenced `ShardRouter` boundary and versioned consistent-hash ring.

**Tech Stack:** Node >=22, npm workspaces, Express, `pg`, BullMQ, Redis, PostgreSQL 16, Next.js App Router, Vitest, Playwright, k6, Prometheus/Grafana.

**Spec:** `PRD.md` v2.5 (sections cited per task), `docs/decisions.md` D-001..D-008, `docs/shard-owned-tables.md`, `docs/experiments/00-method.md`. This plan **supersedes** `docs/superpowers/plans/2026-10-15-remaining-phases-8-11.md` Tasks 4–5 (its Tasks 1–3 are already committed).

## Global Constraints

- Node `>=22`; run workspace scripts via `npm --workspace`. Migrations are `NNN_name.sql` in one global increasing sequence, immutable once executed; re-run `node infrastructure/postgres/runner.mjs` after adding any.
- Bucket count fixed at `256`; `bucket_id = SHA256(lowercase-hyphenated-UUID)[first 4 bytes BE] mod 256`; ring `V = 128`; all processes share one ring configuration (D-001).
- Registry heartbeat `5 s`, TTL `30 s`, stop-write margin `10 s`; worker lease TTL `60 s`, renew `10 s` (D-002). Access token TTL 10 min.
- Every shard write goes through `withFencedWrite` (shared-fence semantics are approximated by the exclusive advisory lock — do not change that). CI/lint rejects direct shard-pool access outside the D-007 exceptions.
- Errors use the core `errorEnvelope` shape. IDs are 64-bit-safe strings.
- Evidence rule: `docs/evaluation.md` may only contain numbers taken from committed raw outputs under `docs/experiments/raw/` (or from a run recorded in this plan). Never invent or "estimate" a number.
- Tests run serially: `--no-file-parallelism`. `RATE_LIMIT_BYPASS_IPS` is test-only and must be impossible to activate accidentally in production.
- Commit after every task; keep the message in the repo's existing style (`Phase N: ...` or `feat: ...`).

## Prerequisites (once per machine; re-check at the start of every task that needs the stack)

```bash
export CATALOG_DATABASE_URL=postgres://hrms:hrms@localhost:5438/hrms_catalog
export DATABASE_SHARD_1_URL=postgres://hrms:hrms@localhost:5439/hrms_shard1
export DATABASE_SHARD_2_URL=postgres://hrms:hrms@localhost:5440/hrms_shard2
export DATABASE_SHARD_3_URL=postgres://hrms:hrms@localhost:5441/hrms_shard3
export DATABASE_SHARD_4_URL=postgres://hrms:hrms@localhost:5442/hrms_shard4
export REDIS_QUEUE_URL=redis://localhost:6379 REDIS_KV_URL=redis://localhost:6380
export API_BASE=http://localhost:4000
docker compose up -d                      # pg-catalog, shards 1-4, redis x2, mailpit, nginx
node infrastructure/postgres/runner.mjs   # migrations (all 5 URLs exported)
node infrastructure/postgres/seed.cjs && node infrastructure/postgres/seed-demo.cjs
npm --workspace @hrms/api run dev &       # :4000
npm --workspace @hrms/worker run dev &    # worker
npm --workspace @hrms/web run dev         # :3000
```

Test commands used below: `npm --workspace @hrms/core run test`; `npm --workspace @hrms/api run test -- --run test/<file>.test.ts --no-file-parallelism`; e2e: `npm --workspace @hrms/web run e2e`; guard: `bash scripts/check-direct-pool-access.sh`.

## Review Focus

The review subagents should verify these spec requirements, hardest-first:

1. **Catalog write-gate coverage (PRD §9.2, §15.3):** every catalog-owned mutation — jobs, short URLs, departments/designations, cycles/reviews, payroll batches and structures, sourcing runs, candidate email claims, users/roles, directory rebuild, announcements — checks the gate *inside the same transaction* as its write (and its audit row). Grep the codebase for `catalogPool.query` writes in routes and confirm each is either gated or intentionally ungated.
2. **Partial-result honesty (PRD §34 scenario I):** every scatter-gather read over shards returns `meta.partial=true` + `unavailable` shard list when any shard errored; no page renders outage data as complete.
3. **Write-path invariants (PRD §34 scenario J/K, NFR-MIG-04):** all shard writes flow through `withFencedWrite`; a process whose local heartbeat deadline expired cannot write; the durable gate markers stop a stale writer even when its map pointer is old.
4. **Evidence rule:** every number in `docs/evaluation.md` traces to a file in `docs/experiments/raw/` (or a scenario file added by Task 20); `—` remains where no data exists.
5. **Rate-limiter identity (PRD §6.12, §17.2):** behind NGINX the limiter keys on the real client IP via a narrow `trust proxy`; `RATE_LIMIT_BYPASS_IPS` is inert when `APP_ENV=production`.

## Block A — Land in-flight work and Phase 10 evidence

### Task 1 — Stabilize and commit the in-flight Phase 10b hardening

**Files:** `.gitignore`; commits of the 14 modified files + `apps/web/e2e/`, `apps/web/playwright.config.ts`.
**Consumes:** nothing. **Produces:** clean tree at a new commit; e2e suite tracked.

- [ ] `git status --short` — expect the known in-flight set (catalog gate hooks, worker registry, rate-limit bypass, `PATCH /employees/me` + profile/settings pages, `apps/web/e2e/`, `apps/web/playwright.config.ts`, `docs/evaluation.md`, `apps/web/test-results/`).
- [ ] Ensure `apps/web/test-results/` is listed in `.gitignore` (append if missing).
- [ ] `npm run typecheck` — expect clean. (If no root script exists, run `--workspace` typecheck for core, api, web, worker.)
- [ ] `npm --workspace @hrms/core run test` and `npm --workspace @hrms/api run test` (stack up) — expect all green.
- [ ] `npm --workspace @hrms/web run e2e` — expect 11 passed. If the only failure is stale `test-results/`, fix the artifact, not the spec.
- [ ] Commit 1: `Phase 10b: catalog gate enforcement hooks, worker registry, rate-limit bypass escape, self-service profile` (all modified source files). Commit 2: `Phase 10b: Playwright e2e suite` (e2e dir, playwright config, `.gitignore`).
- [ ] `git status --short` — only `docs/evaluation.md` untracked (Task 2 owns it).

### Task 2 — Fill `docs/evaluation.md` from committed raw runs

**Files:** modify `docs/evaluation.md`; read-only `docs/experiments/raw/*`, `docs/experiments/00-method.md`; create `docs/experiments/raw/smoke-r1.txt`.
**Consumes:** raw k6/bench outputs already committed. **Produces:** evaluation tables with per-run values and median [range] aggregates.

- [ ] Read `docs/experiments/00-method.md` first so table row names and the "median [range], never average" rule are copied exactly.
- [ ] Extract per-run numbers from each raw file: `http_req_duration` `p(50)/p(95)/p(99)`, `http_reqs` rate, `http_req_failed` rate; tagged metrics where present (`checkin`, burst profile); bench files print their own JSON keys — copy them verbatim.
- [ ] Fill the workload table rows for mixed-low/medium/high (r1–r3 each) with per-run values plus median [range] for p95/p99 and throughput. Fill the 9AM burst row from the burst raw file. Fill component-comparison rows: autocomplete Redis vs catalog baseline (suggest bench), fenced vs bare write (fence bench), limiter overload (ratelimit raw: 429 counts + rejected rate). Leave `—` where no raw data exists (failure-scenario rows are Task 20's).
- [ ] Do not touch the consistent-hashing row (already filled from the committed distribution run).
- [ ] Run one smoke test and save the raw: `k6 run tests/load/smoke.js` with the API running and the same limiter setting `00-method.md` documents for smoke runs; save output to `docs/experiments/raw/smoke-r1.txt`; update the evaluation intro line that currently cites an uncited smoke p95 to cite this file (or delete the uncited number).
- [ ] Re-read every filled table against its raw file (fresh eyes, diff-like pass); fix any mismatch.
- [ ] Commit: `Phase 10: evaluation tables filled from committed raw runs + smoke raw artifact`.

## Block B — Enforcement (system-design acceptance)

### Task 3 — Catalog write-gate coverage for all catalog-owned mutations

**Files:** modify `apps/api/src/routes/jobs.ts` (job create/close, short URLs), `admin.ts` (directory rebuild, departments, designations), `performance.ts` (cycle create/close), `payroll.ts` (batch create/fail, structures upsert), `sourcing.ts` (crawl run start/fail), `applications.ts` (candidate email claims, candidate index rows), `employees.ts` (deactivate → `users` update). New test: `apps/api/test/catalog-gate.test.ts`.
**Consumes:** `assertCatalogOpen(db)`, `CatalogGateError`, `gateError(res)` (`apps/api/src/catalog-gate.ts`), `writeAudit(db, event)`. **Produces:** every catalog-owned mutation checks the gate inside its own transaction.

- [ ] Open each listed route file and list every state-changing catalog endpoint (writes to `catalogPool`). The known ungated sites from the 2026-10-17 audit: jobs create/close, short-url create, departments/designations, cycles create/close, payroll batches/structures, sourcing runs, candidate email claims, admin user updates, directory rebuild.
- [ ] Write the failing test first (`catalog-gate.test.ts`): with HR/ADMIN tokens obtained via the existing test helpers, set `UPDATE catalog_write_gate SET state='GATED'` via `catalogPool`, call one representative endpoint per file (copy the exact paths from the route files), expect `503` + code `GATE_CLOSED`; reopen in `finally`, call one endpoint again, expect 2xx. Run it: `npm --workspace @hrms/api run test -- --run test/catalog-gate.test.ts --no-file-parallelism` — expect failures on exactly the ungated endpoints.
- [ ] Implement the pattern per endpoint: `const c = await catalogPool.connect()` → `BEGIN` → `assertCatalogOpen(c)` → writes + `writeAudit(c, ...)` → `COMMIT`; on `CatalogGateError` → `ROLLBACK` + `gateError(res)`; always `release()`. Endpoints that already gate but outside their txn: move the check into the txn (e.g. `admin.ts` rebuild, `performance.ts` release).
- [ ] Re-run the test until green; re-run the full serial API suite to catch transaction regressions.
- [ ] Commit: `Phase 10b: catalog write-gate coverage for all catalog-owned mutations`.

### Task 4 — Fence the remaining shard writes

**Files:** modify `apps/api/src/routes/applications.ts` (≈ lines 113 withdrawn-reuse, 318 interview insert, 340 interview update, 370 assessment insert, 424 convert update), `employees.ts` (≈ line 389 leave reassignment on deactivate), `notifications.ts` (≈ line 53 read-at update). New test: `apps/api/test/fence-coverage.test.ts`.
**Consumes:** `withFencedWrite(pool, fn)` (`@hrms/core`), `shardFor(employeeId)`, `GateClosedError` → existing `gateError(res)` mapping. **Produces:** zero unfenced shard writes in API routes.

- [ ] Write the failing test first: `UPDATE shard_write_gate SET state='GATED', epoch=11` on all three active shards (direct `Pool` like `gate.test.ts` does), then call the concrete endpoints reaching each of the 7 sites (paths and payloads copied from the route files), expect `503 GATE_CLOSED`; `finally` reopen gates on all shards. Run it and watch the unfenced sites return 200/fabricated success.
- [ ] Wrap each site in `withFencedWrite(target.pool, async (c) => { ... })`. For multi-site flows (convert = shard update + catalog update) keep the shard effect inside the fence and the catalog effect in its own txn; never hold both.
- [ ] Re-run the new test + `recruitment`, `employees`, `notifications` suites until green.
- [ ] Confirm the guard once more: `bash scripts/check-direct-pool-access.sh` (still passes at this point; Task 5 tightens it).
- [ ] Commit: `Phase 10b: fence all remaining shard writes (applications, deactivate, notifications)`.

### Task 5 — Shard read helper, per-shard pool timeouts, stronger pool-access guard

**Files:** create `apps/api/src/db/shards.ts`; modify `apps/api/src/db/pools.ts`, every `apps/api/src/routes/*` file that imports `shardPools`, `apps/api/src/directory/self.ts`, `apps/api/src/index.ts` (error handler), `scripts/check-direct-pool-access.sh`.
**Consumes:** `shardPools`, active shards 1–3. **Produces:** routes never import `shardPools` directly; a CI rule that fails on new violations; `503 DEPENDENCY_UNAVAILABLE` instead of bare 500s when a shard is down.

- [ ] In `pools.ts` add timeouts to every pool: `connectionTimeoutMillis: 2000`, `query_timeout: 5000`, `idleTimeoutMillis: 10000` (PRD: hung shard must not exhaust pools).
- [ ] Create `db/shards.ts`: `export function poolFor(shard: string): Pool | undefined`; `export function ownedShardPools(): Array<{ shard: string; pool: Pool }>` (shard-1..3); `export function allShardPools(): Array<{ shard: string; pool: Pool }>` (diagnostics/admin only, includes shard-4).
- [ ] Replace all `shardPools` usage in `routes/*` and `directory/self.ts` with `ownedShardPools()` / `poolFor()` / the existing `shardFor()`. Keep `shardPools` imports only in `db/pools.ts`, `db/shards.ts`, `migration/`, `routes/health.ts` (diagnostic), tests and bench files.
- [ ] In `index.ts` replace the default error handler with one that maps pg availability errors (`ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, `57P01`, `57014`, `Connection terminated`) to `503 errorEnvelope("DEPENDENCY_UNAVAILABLE", "A backend dependency is unavailable; retry shortly")`; keep a 500 fallback.
- [ ] Extend `scripts/check-direct-pool-access.sh` with a second rule: `git grep -n 'shardPools' -- 'apps/api/src' 'packages/core/src' 'apps/worker/src'` must only match the allow-list (`apps/api/src/db/pools.ts`, `apps/api/src/db/shards.ts`, `apps/api/src/migration/`, `apps/api/src/routes/health.ts`, `apps/worker/src/pools.ts`, `apps/worker/src/index.ts`); otherwise exit 1 listing the violations. Keep the existing `new Pool(`/`from "pg"` rule.
- [ ] Verify: guard passes; serial API suite passes; quick manual: `docker compose stop shard-2`, `curl -s $API_BASE/api/v1/employees/<shard-2-id>` with a valid token → `503 DEPENDENCY_UNAVAILABLE` (not 500); `docker compose start shard-2`.
- [ ] Commit: `Phase 10b: route shard reads via db/shards, pool timeouts, CI pool-access guard v2`.

### Task 6 — Local registry write deadline (D-002) for API and worker

**Files:** create `packages/core/src/registration.ts` + `packages/core/test/registration.test.ts`; export from `packages/core/src/index.ts`; modify `apps/api/src/registry.ts`; create `apps/api/src/fenced.ts`; replace `withFencedWrite` imports with `fencedWrite` in all `apps/api/src/routes/*`; modify `apps/worker/src/index.ts` (guard job handling).
**Consumes:** `registerProcess` heartbeat loop (5 s). **Produces:** `registrationValid()`; a write-time assertion that stops state-changing work ≈20 s after the last heartbeat send.

- [ ] Core, TDD: `packages/core/test/registration.test.ts` for `registrationValid(lastSentMonoMs, nowMonoMs, ttlMs = 30000, marginMs = 10000): boolean` — valid at `ttl − margin − 1`, invalid at `ttl − margin`, invalid after a clock jump, invalid when `lastSentMonoMs` is null. Implement in `registration.ts` (pure function, no imports).
- [ ] `registry.ts`: record `lastSentMono = Number(process.hrtime.bigint() / 1000000n)` at every heartbeat *send*; read TTL/margin from `REGISTRY_TTL_MS`/`REGISTRY_MARGIN_MS` with D-002 defaults; export `assertRegistrationValid()` (throws `RegistrationExpiredError extends GateClosedError`) and `registrationState()` for tests.
- [ ] `apps/api/src/fenced.ts`: `export async function fencedWrite<T>(pool: PoolLike, fn: (c: PoolClientLike) => Promise<T>): Promise<T>` calling `assertRegistrationValid()` then `withFencedWrite`. Because `RegistrationExpiredError` extends `GateClosedError`, existing route catches map it to `503 GATE_CLOSED` without changes — verify one route test asserts the envelope text still says retry shortly.
- [ ] Swap imports in all route files from `withFencedWrite` to `fencedWrite`; run the serial suite.
- [ ] Worker: in `apps/worker/src/index.ts`, before handling payroll/crawler jobs, call the same `registrationValid()` with the worker's tracked heartbeat send time; on expiry throw so BullMQ retries later. No behavior change while the catalog is up.
- [ ] Commit: `Phase 10b: local registry write deadline enforced on API and worker paths`.

### Task 7 — `KvStore` interface with a Redis adapter

**Files:** create `packages/core/src/kv.ts` + `packages/core/test/kv.test.ts`; export from core index; modify `apps/api/src/db/redis.ts` (add `kv()`), `apps/api/src/auth/sessions.ts`, `apps/api/src/middleware/rate-limit.ts`, `apps/api/src/routes/jobs.ts` (short-link cache), any other simple get/set/del users (`git grep redisKv`).
**Consumes:** existing `TokenBucket` Lua logic. **Produces:** `KvStore` (minimum: `get`, `set` with TTL, `del`, atomic `takeToken`) used by sessions, limiter, short-link cache.

- [ ] Define in `kv.ts`: `interface KvStore { get(key): Promise<string | null>; set(key, value, ttlSeconds?): Promise<void>; del(key): Promise<void>; takeToken(key, capacity, windowMs): Promise<BucketResult> }` and `class RedisKvStore implements KvStore` taking a minimal `{ get, set, del, eval }` client, delegating `takeToken` to the existing `TokenBucket` implementation (keep `TokenBucket` exported).
- [ ] Tests: fake-client semantics tests plus a `REDIS_LIVE=1`-gated integration test — 50 concurrent `takeToken` on capacity 10 allow exactly 10, and `set` with TTL expires.
- [ ] `db/redis.ts`: add `export function kv(): KvStore` (singleton `RedisKvStore` over `redisKv()`); keep raw `redisKv()` for sorted-set users (autocomplete) and document that in a comment.
- [ ] Refactor sessions (`get`/`set`/`del`), rate-limit middleware (`takeToken`), and the short-link cache in `jobs.ts` onto `kv()`.
- [ ] Run core tests, identity suite (login/refresh/logout + limiter burst 429), jobs suite.
- [ ] Commit: `Phase 10b: KvStore interface + Redis adapter; sessions, limiter and short-link cache refactored`.

### Task 8 — Migration smoke-failure rollback and gate/stale-writer tests

**Files:** modify `apps/api/src/migration/runner.ts` (export `setShardGates`; add `revertAfterSmokeFailure(runId, actor)`; call it in the smoke-failure path). New test: `apps/api/test/migration-gate.test.ts`.
**Consumes:** `migration_runs`, `catalog_write_gate`, `shard_write_gate`, `routing_map_versions` (CAS semantics). **Produces:** failed post-cutover smoke test reverts the map and leaves a consistent, documented state; tests proving the fence beats stale writers.

- [ ] Implement `revertAfterSmokeFailure(runId, actor)`: (1) revert the employee active map only via the same-epoch CAS (`UPDATE routing_map_versions SET active = (version = $fromVersion) WHERE domain='employee' AND EXISTS (SELECT 1 FROM routing_map_versions WHERE version=$toVersion AND active)`); (2) set run `state='ABORTED'`, `current_step='smoke_reverted'`, error text; (3) audit `migration.smoke_failed`; (4) reopen shard gates same-epoch CAS; (5) reopen the catalog gate same-epoch CAS. Wire the existing smoke-check failure branch in `startMigration` to call it instead of the current FAilED-only path.
- [ ] Tests (integration, live stack): (a) drain test — start `withFencedWrite` whose `fn` sleeps 1500 ms; concurrently call `setShardGates([shard], 'GATED', epoch)`; assert the gate write completes only after the slow fn resolves, and any `withFencedWrite` then rejects `GateClosedError`; (b) stale-writer test — resolve a pool via the *old* map, switch the active employee version and set shard GATED, then assert a fenced write through the old pool still rejects `GateClosedError`; (c) rollback test — simulate an active `toVersion` + GATED shards + a run row, call `revertAfterSmokeFailure`, assert map reverted, gates OPEN same epoch, run `ABORTED`, audit row present; restore original state in `finally`.
- [ ] Run: `npm --workspace @hrms/api run test -- --run test/migration-gate.test.ts --no-file-parallelism`.
- [ ] Commit: `Phase 10b: smoke-failure map rollback + drain/stale-writer gate tests (Scenario K cores)`.

### Task 9 — Candidate map seeding + `loadActiveMap` domain fix

**Files:** modify `packages/core/src/shard-router.ts` (`loadActiveMap`), `infrastructure/postgres/seed.cjs`; create `packages/core/test/load-active-map.test.ts`; extend `apps/api/test/seed-routing.test.ts` (or the existing seed test).
**Consumes:** `buildCandidateMapV1`, `ACTIVE_SHARDS`. **Produces:** a fresh `runner + seed + seed-demo` boot seeds the candidate map; employee routing can never pick up a candidate active version.

- [ ] Fix `loadActiveMap` to filter `WHERE active = TRUE AND domain = 'employee'` (today it takes the highest active version across all domains — seeding the candidate map would silently hijack employee routing).
- [ ] Core unit test with a fake queryable: returns the employee row even when a higher-version candidate map is active; assert the SQL contains the domain filter.
- [ ] `seed.cjs`: after the employee map exists, seed the candidate map idempotently — next global version, `domain='candidate'`, active, `buildCandidateMapV1` rows into `routing_map_buckets` (skip if an active candidate map already exists). Re-run `runner.mjs`, `seed.cjs`, `seed-demo.cjs` against the current DB to confirm idempotency.
- [ ] Extend the seed integration test: candidate active map exists; every candidate row's shard ∈ {shard-1, shard-2, shard-3}; no shard-4; `loadActiveMap` still returns the employee map.
- [ ] Run core tests + seed test + recruitment suite.
- [ ] Commit: `Phase 10b: seed candidate routing map; loadActiveMap employee-domain fix + tests`.

## Block C — Functional gaps

### Task 10 — Password recovery (forgot/reset) end-to-end

**Files:** create `infrastructure/postgres/migrations/017_catalog_password_resets.sql`, `apps/api/src/email.ts`, `apps/api/test/password-reset.test.ts`, `apps/web/app/forgot-password/page.tsx`, `apps/web/app/reset-password/page.tsx`; modify `apps/api/src/routes/auth.ts`, `apps/api/src/auth/sessions.ts`, `apps/api/src/middleware/rate-limit.ts`, the login page.
**Consumes:** `hashToken`, `hashPassword` (argon2), `EmailProvider` interface (`packages/core/src/providers.ts`), Mailpit. **Produces:** FR-02 recovery flow: always-200 request, single-use 30-min token, session revocation, `recover` limiter scope.

- [ ] Migration: `password_resets (reset_id UUID PK, user_id UUID NOT NULL, token_hash TEXT UNIQUE NOT NULL, status TEXT CHECK IN ('PENDING','USED','EXPIRED') DEFAULT 'PENDING', expires_at TIMESTAMPTZ NOT NULL, created_at, used_at)` + index on `user_id`. Run `node infrastructure/postgres/runner.mjs`.
- [ ] `sessions.ts`: maintain a revocable index — `SADD usersessions:{userId} {sessionId}` on create/rotate, `SREM` on destroy, plus `export async function destroyUserSessions(userId)` (iterate ids, DEL keys, DEL set). TTL 7 days.
- [ ] `email.ts`: `export function emailProvider(): EmailProvider` — nodemailer SMTP to `SMTP_HOST`/`SMTP_PORT` (default `localhost:1025` Mailpit), from `HRMS <no-reply@hrms.local>`; match the core `EmailProvider` shape exactly. Log-and-swallow transport errors.
- [ ] `auth.ts`: `POST /forgot-password` and `POST /reset-password`, both behind a new `recoverLimit = rateLimit("recover", { capacity: 10, windowMs: 60_000, failOpen: false })`. Forgot: always `200 {success:true}`; when the user exists, expire their PENDING rows, insert a fresh token (32 random bytes hex; store `hashToken`), e-mail `http://localhost:3000/reset-password?token=...`, audit `password.reset_requested`. Reset: min 8 chars; match token by hash, status PENDING, `expires_at > now()`; update `users.password_hash`; mark USED; `destroyUserSessions(userId)`; audit `password.reset`; wrong/used/expired token → `410 errorEnvelope("TOKEN_INVALID", ...)`.
- [ ] Web: `/forgot-password` (email form → neutral success state), `/reset-password` (reads `?token=`, two password fields, success → login link), "Forgot password?" link on login.
- [ ] Test first, then implement (TDD order): unknown email → 200, no row; known email → PENDING row + message visible in Mailpit (poll `http://localhost:8025/api/v1/messages`, skip SMTP assertion when `MAIL_LIVE` unset); reset → login with new password works, old fails, a session created before reset no longer refreshes; reused token → 410; 11th call in a minute → 429.
- [ ] Run the test + identity suite; commit: `Phase 10b: password recovery (forgot/reset) with Mailpit email and session revocation`.

### Task 11 — Partial-result flagging for every scatter-gather read

**Files:** modify `apps/api/src/db/shards.ts` (add `partialMeta(unavailable: string[]): { partial: boolean; unavailable: string[] }`), `apps/api/src/routes/reports.ts`, `employees.ts` (`/team`), `performance.ts` (summary/team), `payroll.ts` (batch detail if scattered), `leave.ts`/`attendance.ts` only if a loop lacks the flag; web banner on the reports page.
**Consumes:** the scatter loops hitting `ownedShardPools()`. **Produces:** `meta: { partial, unavailable }` on every response assembled from multiple shards.

- [ ] `git grep -n "ownedShardPools()" apps/api/src/routes` and inspect each loop: collect failed shard ids instead of silently skipping; spread `...partialMeta(unavailable)` into the response `meta` (always present, `partial:false` when healthy).
- [ ] Reports page: show the "Some shards are unavailable — figures may be incomplete" banner when `meta.partial`, mirroring the attendance page's existing banner.
- [ ] Tests: assert `meta.partial === false` in the happy-path suites (reports/attendance/leave/employees team). The real outage assertion is Scenario I in Task 20 — record the manual evidence there and reference it from `docs/evaluation.md`.
- [ ] Commit: `Phase 10b: partial-result meta on all scatter-gather reads`.

### Task 12 — Audit completeness (atomic audit / outbox rows for all control-plane actions)

**Files:** modify `jobs.ts` (close, short URL), `admin.ts` (departments/designations txns, rebuild, shard preview audit), `performance.ts` (cycles create/close + review submit/release AUDIT outbox), `payroll.ts` (structure upserts AUDIT outbox), `employees.ts` (PATCH `/:id`, PATCH `/me`, onboard AUDIT outbox), `leave.ts` (cancel AUDIT outbox), `applications.ts` (interview create/update, assessment, convert AUDIT outbox), `sourcing.ts` (run start/fail audit atomic). Extend the matching test files.
**Consumes:** `writeAudit` (catalog, same txn as the write) and the existing shard `outbox` AUDIT pattern (copy it verbatim from a route that already does it, e.g. leave submit). **Produces:** every control-plane mutation leaves an audit trail atomically with the mutation.

- [ ] Copy the existing AUDIT outbox insert pattern; one row per business event, `eventId = nextEventId()`, inside the `withFencedWrite` txn.
- [ ] For catalog writes: audit row in the same catalog txn (Task 3 already put many behind BEGIN/COMMIT — extend those blocks).
- [ ] Extend suites with one assertion each: after the action, the catalog `audit_logs` row exists (allow the dispatcher tick exactly as the existing dispatcher test does).
- [ ] Run the affected serial suites; commit: `Phase 10b: atomic audit coverage for control-plane mutations`.

### Task 13 — Admin users & roles (API + pages)

**Files:** modify `apps/api/src/routes/admin.ts`; create `apps/api/test/admin-users.test.ts`, `apps/web/app/admin/users/page.tsx`, `apps/web/app/admin/roles/page.tsx`; sidebar links (Task 17 can wire them — add here if simpler).
**Consumes:** `users`, `user_roles`, `destroyUserSessions` (Task 10). **Produces:** minimal user administration: list, role assignment, deactivation — all gated + audited.

- [ ] `GET /api/v1/admin/users` (ADMIN): users joined with roles, `is_active`, linked `employee_id`; pagination `limit/offset`.
- [ ] `PATCH /api/v1/admin/users/:id/roles` (ADMIN): body `{ roles: [...] }`, validate against `EMPLOYEE|MANAGER|HR|ADMIN`, tx + gate + atomic audit `admin.roles_changed`, refuse editing your own account (`400 SELF_EDIT`).
- [ ] `POST /api/v1/admin/users/:id/deactivate` (ADMIN): tx + gate + audit `admin.user_deactivated` + `destroyUserSessions`.
- [ ] Pages: `/admin/users` (table, role editor, deactivate button), `/admin/roles` (read-only permission matrix from the PRD §10.2 table + current role counts).
- [ ] Test first: list shape; role change persists + audit row; deactivated user can no longer log in and loses sessions; gate closed → 503; HR → 403.
- [ ] Commit: `Phase 10b: admin user/role management + pages`.

### Task 14 — HR announcements + notification preferences

**Files:** create migrations `018_catalog_notifications.sql`, `019_shard_notification_source.sql`, `apps/api/test/announcements.test.ts`; modify `packages/core/src/queue.ts` (`JobName` += `"announcement-fanout"`), `apps/worker/src/index.ts` (handler), `apps/api/src/routes/notifications.ts`, web `/notifications` + `/settings` pages.
**Consumes:** BullMQ worker, existing notification e-mail path if present. **Produces:** FR-13 announcements with idempotent fan-out and per-user prefs.

- [ ] Migrations: `announcements (announcement_id TEXT PK, title, body, created_by, created_at)`; `notification_prefs (user_id UUID PK, email_enabled BOOL DEFAULT TRUE, in_app_enabled BOOL DEFAULT TRUE)`; shards: `notifications.source_ref TEXT` + unique `(employee_id, source_ref) WHERE source_ref IS NOT NULL`.
- [ ] Worker handler `announcement-fanout` `{announcementId, shard}`: for ACTIVE employees owned by that shard, insert `notifications` (`kind='ANNOUNCEMENT'`, `source_ref=announcementId`) `ON CONFLICT DO NOTHING`; skip employees whose user disabled in-app; send the announcement e-mail only when `email_enabled`. Job id `announce-{id}-{shard}` for queue-level dedupe.
- [ ] API: `POST /api/v1/notifications/announcements` (HR/ADMIN; catalog txn + gate + audit `announcement.created` + enqueue one fan-out job per active shard); `GET`/`PUT /api/v1/notifications/prefs` (self; upsert).
- [ ] Web: HR/ADMIN "New announcement" form on `/notifications`; Notification section with two toggles on `/settings`.
- [ ] Test first: HR create → per-shard notification rows appear (poll ≤30 s, worker up); re-enqueue same job id → row count unchanged; `in_app_enabled=false` user gets none; prefs round-trip; EMPLOYEE create → 403.
- [ ] Commit: `Phase 10b: HR announcements + notification preferences`.

### Task 15 — Attendance reports + HR corrections

**Files:** modify `apps/api/src/routes/attendance.ts`; create `apps/api/test/attendance-reports.test.ts`, `apps/web/app/hr/attendance/reports/page.tsx`; correction dialog on `/hr/attendance`.
**Consumes:** `ownedBuckets()`, `withFencedWrite`, AUDIT outbox pattern. **Produces:** §6.6 weekly/monthly/department reports; auditable corrections.

- [ ] `GET /api/v1/attendance/reports` (HR/ADMIN; `from`,`to` default current month): per-day `{present, late, absent, halfDay}` + per-department breakdown; scatter with `meta.partial` (Task 11 helper).
- [ ] `POST /api/v1/attendance/corrections` (HR/ADMIN): `{employeeId, workday, status, checkIn?, checkOut?, reason}` (`reason` ≥3 chars); fenced upsert `ON CONFLICT (employee_id, workday) DO UPDATE` + AUDIT outbox in the same txn.
- [ ] Page: range + department filters, totals table, partial banner; row edit opens the correction dialog.
- [ ] Test first: totals match seeded fixture; correction changes the row + leaves an audit event; gate closed → 503; EMPLOYEE → 403.
- [ ] Commit: `Phase 10b: attendance reports + audited HR corrections`.

### Task 16 — Employee detail access for managers + per-employee activity endpoint

**Files:** modify `apps/api/src/routes/employees.ts`; create `apps/api/test/employees-activity.test.ts`.
**Consumes:** `selfEmployeeId`. **Produces:** manager-of access to a direct report's profile; `GET /api/v1/employees/:id/activity`.

- [ ] Extend `canSee(req, row)`: HR/ADMIN, self, **or** `row.manager_id` equals the requester's employee id.
- [ ] `GET /api/v1/employees/:id/activity` (same authorization): single-shard reads — last 30 attendance rows, last 20 leave requests, last 12 payroll records — `{ data: { attendance, leave, payroll } }`.
- [ ] Test first: HR any; manager direct report; employee self; unrelated employee → 403; unknown → 404.
- [ ] Commit: `Phase 10b: manager access to direct reports + employee activity endpoint`.

### Task 17 — Web navigation and page completion

**Files:** apps/web pages/components (sidebar/topbar layout component, `/hr/recruitment/jobs/new`, `/manager/team/:id`, `/hr/employees/:id` tabs, dashboard, `e2e/hrms.spec.ts`).
**Consumes:** Task 16 activity endpoint, existing endpoints. **Produces:** no broken links; role-aware sidebar; profile menu; manager detail; HR employee tabs.

- [ ] Create `/hr/recruitment/jobs/new` (move the inline job form) and fix the list-page link.
- [ ] Sidebar role-aware hrefs: HR/ADMIN → `/hr/attendance`, `/hr/leave`, `/hr/payroll`, `/hr/performance`, plus Admin section (`/admin/users`, `/admin/roles`, `/admin/audit-logs`, `/admin/system-health`, `/admin/shards`); others keep self-service hrefs.
- [ ] Topbar avatar menu: Profile (`/profile`) + Logout (fixes the unreachable `/profile`).
- [ ] `/manager/team/:id`: profile card + attendance slice + leave history (via `/employees/:id/activity`) + link to performance; list rows link here.
- [ ] `/hr/employees/:id` tabs: Overview / Attendance / Leave / Payroll (same activity endpoint).
- [ ] Dashboard: role-aware greeting + self cards (today's attendance, leave balance, latest payslip, unread notifications count).
- [ ] Extend e2e with 2 specs (profile menu → `/profile`; admin nav renders `/admin/users`); run `npm --workspace @hrms/web run e2e`.
- [ ] Commit: `Phase 10b: web navigation, manager detail, HR employee tabs, dashboard cards`.

## Block D — Infrastructure

### Task 18 — NGINX multi-replica, narrow trust proxy, limiter hardening

**Files:** modify `infrastructure/nginx/nginx.conf`, `apps/api/src/index.ts`, `apps/api/src/middleware/rate-limit.ts`, README; create `apps/api/test/trust-proxy.test.ts` (pure parser tests).
**Consumes:** NGINX container (host :8080) → API on host ports. **Produces:** PRD §17.2 replica demo path + limiter identity from `X-Forwarded-For` under a narrow trust boundary.

- [ ] `index.ts`: `app.set("trust proxy", parseTrustProxy(process.env.TRUST_PROXY ?? "172.16.0.0/12"))` — `parseTrustProxy` accepts comma-separated IP/CIDR/hop-count tokens validated by regex, throws at boot otherwise (never trust arbitrary headers). Export it for tests; unit-test valid subnet, hop number, invalid token.
- [ ] Listen on `Number(process.env.API_PORT ?? 4000)` (already supported — verify) and add a tiny `res.setHeader("x-api-instance", API_PORT)` so round-robin can be observed in evidence.
- [ ] `rate-limit.ts`: when `APP_ENV === "production"`, ignore `RATE_LIMIT_BYPASS_IPS` entirely (log once); the bypass header stays test-only.
- [ ] Audit the limiter scope table against PRD §17.2 and add any missing scopes with the PRD's fail policy (invitation acceptance, public job browsing, crawler/autocomplete as specified); add prom-client counters `rate_limit_allowed_total{scope}` / `rate_limit_rejected_total{scope}` so Task 19's dashboard can chart 429s by scope.
- [ ] Protect the API `/metrics` endpoint: reject requests whose *socket* peer is not loopback/private (do not rely on `req.ip`/forwarded headers) unless `METRICS_TOKEN` is presented; Prometheus scrapes from the compose network, so targets stay green. Document the rule.
- [ ] `nginx.conf`: upstream lists `4000`, `4002`, `4003` (each `max_fails=2 fail_timeout=10s`), round-robin default documented in a comment (least_conn alternative noted); add `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` and `X-Forwarded-Proto $scheme;`.
- [ ] README: replica recipe (`API_PORT=4002 npm --workspace @hrms/api run dev`, `API_PORT=4003 ...`), NGINX entry point `http://localhost:8080`, trust-proxy env meaning.
- [ ] Verify: two replicas + nginx; `for i in {1..6}; do curl -sD- -o /dev/null localhost:8080/health | grep -i x-api-instance; done` alternates instances; serial API suite still green (default env unchanged).
- [ ] Commit: `Phase 10b: NGINX multi-replica upstream, narrow trust proxy, limiter bypass hardened`.

### Task 19 — Observability completion (worker metrics, exporters, cAdvisor, Grafana, alert)

**Files:** modify `apps/worker/src/index.ts`, `apps/worker/package.json`, `infrastructure/monitoring/prometheus.yml`, `docker-compose.yml` (observability profile), README; create `infrastructure/monitoring/alerts.yml`, `infrastructure/grafana/provisioning/datasources/prometheus.yml`, `infrastructure/grafana/provisioning/dashboards/dashboards.yml`, `infrastructure/grafana/dashboards/{api-overview,worker-queue,shards-redis}.json`.
**Consumes:** prom-client (already an API dep), Prometheus/Grafana compose services. **Produces:** a monitoring stack where every PRD §22 signal is actually visible; the previously dead worker scrape target becomes live.

- [ ] Worker: add `prom-client` if missing; HTTP server on `WORKER_METRICS_PORT` (default 4001) exposing default metrics + `worker_jobs_processed_total{name}`, `worker_jobs_failed_total{name}`, and a `queue_waiting{name}` gauge polled every 15 s from BullMQ `getJobCounts`.
- [ ] `prometheus.yml`: keep api + worker jobs (worker target now real), add jobs for `postgres-exporter-catalog`, `postgres-exporter-shard-{1..4}`, `redis-exporter-{queue,kv}`, `cadvisor`; `rule_files: [alerts.yml]`.
- [ ] `alerts.yml`: `RedisKvMemoryHigh` — `redis_memory_used_bytes / redis_memory_max_bytes > 0.8` for 5 m on the kv instance.
- [ ] `docker-compose.yml` observability profile: `cadvisor`, five `postgres-exporter` instances (one per database), two `redis_exporter` instances; Grafana service mounts the two provisioning files + dashboards dir; set `command: redis-server --maxmemory 256mb` on `redis-kv`.
- [ ] Dashboards: `api-overview` (rate, p95, errors, pool-level latency), `worker-queue` (queue waiting/active/completed/failed, job durations), `shards-redis` (per-pg stat activity, redis memory, 429 rejects by scope).
- [ ] Verify: `docker compose --profile observability up -d`; `curl localhost:4000/metrics` and `curl localhost:4001/metrics`; Prometheus `/targets` all UP; Grafana UI shows the three dashboards; README documents the URLs (`:9090`, `:3001` or current Grafana port).
- [ ] Commit: `Phase 10b: worker metrics endpoint, exporters, cAdvisor, Grafana dashboards, Redis budget alert`.

## Block E — Evaluation close-out & documentation

### Task 20 — Run and record failure/scalability scenarios + close `docs/status.md`

**Files:** create `docs/experiments/raw/scenario-{C,D,E,F,I,J,K}.txt`; modify `docs/evaluation.md` (failure table + any remaining `—` rows), `docs/status.md`.
**Consumes:** the full stack, two API replicas, NGINX :8080. **Produces:** PRD §34 scenario evidence; status shows Phases 8–10 complete with pointers.

Each scenario file records: date, commit hash, setup, the exact commands, copied observed output, interpretation. Compare observed vs expected; any mismatch is a bug to fix in the owning task **before** recording a pass for that row.

- [ ] **C — replica scaling.** Start replicas (`API_PORT=4002`, `API_PORT=4003`); confirm alternation via `x-api-instance`; run the mixed-medium k6 against `http://localhost:8080` with two replicas; save raw; compare throughput/p95 against the committed single-replica medians (comparative wording only, same laptop). Record the active balancing policy.
- [ ] **D — API kill.** During a mixed-medium run through NGINX, kill one replica (`taskkill //PID <pid> //F` or Ctrl-C window); record user-visible failure rate and recovery; restart. Also record `max_fails` behavior when the killed replica is the only target briefly.
- [ ] **E — worker kill/retry.** Start a payroll batch for the demo month; while `RUNNING` kill the worker; restart it; poll to `COMPLETED`; then on every shard: `SELECT employee_id, period, COUNT(*) FROM payroll_records GROUP BY 1,2 HAVING COUNT(*)>1` → empty (no duplicates).
- [ ] **F — Redis roles.** Stop `redis-kv` (`docker compose stop redis-kv`): record new login → fail closed, `sessions` behavior for existing sessions, search degradation/fail-open, limiter behavior on fail-open vs fail-closed scopes; restart. Stop `redis-queue`: enqueue a batch → must **not** show false `COMPLETED`; record; restart. Note which behaviors are fail-open vs fail-closed and why.
- [ ] **I — shard outage.** `docker compose stop shard-2`; pick a shard-2 employee from the routing map; as that employee: check-in → `503 DEPENDENCY_UNAVAILABLE`; HR: `/reports/overview`, `/attendance/day`, `/employees?search=` → `200` with `meta.partial: true` and `shard-2` in `unavailable`; other shards' data intact; `docker compose start shard-2`; recovery. Save exact `curl` outputs.
- [ ] **J — catalog outage + local deadline.** `docker compose stop pg-catalog`; record (1) new login → fail closed, (2) check-in against a healthy shard succeeds only until the local deadline and then fails with `REGISTRATION_EXPIRED`/`GATE_CLOSED` 503 — measure the seconds from last heartbeat send (expect ≈20 s with defaults), (3) employee search behavior, (4) after `docker compose start pg-catalog`, writes resume within one heartbeat. Copy the timing evidence.
- [ ] **K — stale writer.** Reference the Task 8 test run: paste the test names + pass results into the notes file.
- [ ] **G — 9AM burst** was tabulated in Task 2; reference it.
- [ ] Fill the evaluation failure table from these files (only recorded facts, median [range] where repeats exist); leave `—` where the scenario was intentionally not run and note why.
- [ ] Update `docs/status.md`: mark Phases 8–10 done with dates + evidence pointers (the stale "Phases 8–11: NOT STARTED" block goes away); Phase 11 remains deferred per PRD.
- [ ] Commit: `Phase 10: scenario evidence (C,D,E,F,I,J,K), evaluation failure table, status close-out`.

### Task 21 — Decisions, README, manifest, API overview

**Files:** modify `docs/decisions.md`, `README.md`, `docs/shard-owned-tables.md`; create `docs/api/overview.md`.
**Consumes:** code constants + Task 19 budget + Task 18 limiter scopes. **Produces:** every §40C deferred value recorded with its code source.

- [ ] `decisions.md`: add D-009 onward, one entry per value, reading each from code (`file:line` cited), never inventing: autocomplete `K=20`/prefix `12`/TTL/ranking rule; candidate status token TTL; invitation expiry; upload limit; Redis kv budget 256 MB + 80% alert; workload targets (10/30/60 rps); bucket count/hash metadata (256 / SHA-256 first-4-bytes BE); payroll demo percentages; registry deadline (TTL 30 s − margin 10 s = 20 s); password-reset TTL 30 min single-use; the documented worker pool-guard exception; the rate-limit scope table (login 30/min closed, recover 10/min closed, search 60/min open, apply 10/min closed, short 60/min closed).
- [ ] `status.md` already updated in Task 20 — skim for consistency only.
- [ ] `README.md`: current quick start (compose profiles, runner, seeds, api/worker/web), replica recipe, observability URLs, trust-proxy env, test/e2e/k6 commands; spell out the §17.3 profile story (default `docker compose up` = the core set, `--profile observability` = monitoring, k6 host scripts = the loadtest path).
- [ ] `docs/shard-owned-tables.md`: remove stale/duplicate sections; keep the canonical table list + routing-map notes (employee and candidate domains, bucket rule).
- [ ] `docs/api/overview.md`: route-group table (auth, employees, attendance, leave, payroll, jobs, applications, reports, performance, sourcing, notifications, search, admin, system, health) with RBAC column, error-envelope shape, and limiter scopes.
- [ ] Commit: `docs: §40C decisions recorded, README refreshed, shard-owned-tables cleanup, API overview`.

### Task 22 — Final verification

**Files:** none (verification only, plus any last fixes).
- [ ] `npm run typecheck`; core tests; `npm --workspace @hrms/api run test` (full serial suite, stack up); `bash scripts/check-direct-pool-access.sh`; web build; `npm --workspace @hrms/web run e2e`.
- [ ] `git status --short` → empty; `git log --oneline -12` shows one commit per task above.
- [ ] Walk PRD §34 acceptance list once and for each item note the evidence pointer (commit, raw file, or test name) — append that traceability table to `docs/evaluation.md` if it is not already there.
- [ ] Report: completed blocks, scenario outcomes, any `—` cells that remain with reasons.

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-10-17-acceptance-gap-closure.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task with review between tasks; best for the acceptance-critical enforcement block where interface drift is expensive.
2. **Inline Execution** — execute tasks in this session with checkpoints; cheaper and keeps one thread across the many shared files.

Which approach?
