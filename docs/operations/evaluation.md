# Evaluation (measured only)

Method: [00-method.md](../experiments/00-method.md). Demo targets are the scripted acceptance
thresholds given under Workload results — project targets, not production SLOs (PRD §20.5).
Smoke re-run on the current stack (2026-10-17, no bypass — no 429s observed): p95 9.75 ms,
0.00% failed, 100% checks (121/121) ([smoke-r1.txt](experiments/raw/smoke-r1.txt)).

## Workload results

Cells list per-run values in r1 / r2 / r3 order, then the median [range] for p95/p99 and
throughput (percentiles are never averaged, per the method). Values are ms except throughput;
"≈ req/s" divides the http_reqs total by the run duration printed in the raw file. Rows are
`http_req_duration` over all routes, except the burst row, which is the `op:checkin` tag.

| Profile | Runs | p50 | p95 (median [range]) | p99 (median [range]) | Throughput | Errors |
|---|---|---|---|---|---|---|
| Low (10 rps) | 3 | 6 / 7 / 8 | 49 / 75 / 71 → 71 [49–75] | 122 / 707 / 92 → 122 [92–707] | 1530 reqs / 3m0s ×3 → median 1530 [1530–1530] (≈8.5 req/s) | 0% (http_req_failed=0 ×3) |
| Medium (30 rps) | 3 | 7 / 8 / 8 | 27 / 117 / 120 → 117 [27–120] | 123 / 143 / 140 → 140 [123–143] | 6330 reqs / 4m0s ×3 → median 6330 [6330–6330] (≈26.4 req/s) | 0% (http_req_failed=0 ×3) |
| High (60 rps) | 3 | 6 / 7 / 7 | 41 / 71 / 29 → 41 [29–71] | 124 / 97 / 135 → 124 [97–135] | 19830 reqs / 6m0s ×3 → median 19830 [19830–19830] (≈55.1 req/s) | 0% (http_req_failed=0 ×3) |
| 9 AM check-in burst | 3 | 7 / 7 / 8 | 9 / 12 / 16 → 12 [9–16] | 12 / 16 / 18 → 16 [12–18] | 3925 reqs / 1m20s ×3 → median 3925 [3925–3925] (≈49.1 req/s) | 0% (failed=0 ×3) |

Raw files: `mixed-{low,medium,high}-r{1,2,3}.txt`, `burst-r{1,2,3}.txt`. The
`mixed-medium-r{1,2,3}` and `burst-r{1,2,3}` progress lines end with `✗` even though every JSON
summary reports 0% failed and all final percentiles clear the scripted thresholds
(`tests/load/mixed.js`: overall p95<2000/p99<4000 plus per-op thresholds; `tests/load/burst.js`:
checkin p95<3000/p99<6000, failed<15%). Cause: a k6 progress-bar bug in the ramping-arrival-rate
executor (k6 issue #2951, fixed after v2.2.0) — when the executor finishes just before its
nominal duration, the final bar is set from a progress snapshot with p<1 without consulting
thresholds; those raws end at `3m58.8–3m58.9s/4m0s` (medium) and `1m19.9s/1m20s` (burst), while
the `✓` runs (low `3m0s`, high `6m0s`) completed their full duration. The end-of-run JSON
summaries are the record.

The 9 AM burst row doubles as scenario G of the acceptance-gap plan ("tabulated in Task 2;
reference it") — same raws `burst-r{1,2,3}.txt`; no separate rerun was made.

(Project targets are the thresholds the load scripts enforce: overall p95<2000 ms / p99<4000 ms
(`tests/load/mixed.js:29`); 9 AM burst `http_req_failed`<15% and check-in p95<3000 ms / p99<6000 ms
(`tests/load/burst.js:23-24`). Measured medians: low 71 ms, medium 117 ms, high 41 ms p95; burst
failed 0% — all clear.)

Resource usage: `docker stats --no-stream` snapshot of the final running stack in
`resource-snapshot.txt`; per-run sampling follows `00-method.md` (before/after each run), and the
observability profile adds cAdvisor + Grafana (`api-overview`, `worker-queue`, `shards-redis`
dashboards) for continuous per-container CPU/memory.

## Component comparisons (fair baselines)

| Comparison | Result |
|---|---|
| Consistent hashing vs modulo (20k keys, add node) | `bench-ring-r{1,2,3}.txt`: ringRemapPct 25.4 / 24.9 / 24.8 → median 24.9% [24.8–25.4%]; moduloRemapPct 74.4 / 74.5 / 74.4 → median 74.4% [74.4–74.5%]. Ring owners after add (shard-1 / 2 / 3 / 4): 5846 / 5830 / 5829 → 5830 [5829–5846]; 4114 / 4289 / 4221 → 4221 [4114–4289]; 4952 / 4905 / 4998 → 4952 [4905–4998]; 5088 / 4976 / 4952 → 4976 [4952–5088]. The shard-4 migration run is recorded under Failure scenarios. |
| Autocomplete Redis vs indexed catalog | `bench-suggest-r{1,2,3}.txt` (60 cold + 60 warm queries per run, GAP_MS=1100 pacing ≈0.9 req/s): cold `baselineIndexedCatalog` p50 25.08 / 24.79 / 24.63 ms, p95 32.40 / 26.99 / 26.98; warm `redisPrefixCache` p50 25.01 / 24.62 / 24.85, p95 26.69 / 26.76 / 26.60. Both legs report `sources: ["catalog"]` (avgResults 1.3) — the prefix cache never served in this stack state, so the measured delta is catalog-vs-catalog, not cache-vs-catalog. |
| Write-fence overhead vs benchmark-only control | `bench-fence-r{1,2,3}.txt` (single-row UPDATE on shard-1 `bench_probe`, 200 iters per internal run; 3 internal runs per file): overheadPct 37.6 / 21.5 / 12.8 (r1), −3.9 / 35 / 24.2 (r2), 25 / 22.7 / 24.2 (r3) → median 24.2% [−3.9–37.6%]. `fencedMs` p50 6.26–7.18 ms vs `bareMs` p50 5.04–7.47 (p95 8.22–20.01 vs 7.88–19.12) — fence cost is within run-to-run noise at this scale (one negative reading). |
| Rate limiter under overload | `ratelimit-r{1,2,3}.txt` (bad-credential login, 40 iters/s × 60s, no bypass): rejected_429 2351 / 2367 / 2369 of 2400 / 2400 / 2401 requests → rejection_rate 0.980 / 0.986 / 0.987 (median 0.986 [0.980–0.987]); login-tag p50 3 ms / p95 5 ms all runs; only 401/429 observed — the endpoint held. |
| Scatter vs single-shard read | reported with limits (see experiments) |
| Snowflake ID generation (NFR-ID-01) | `bench-id-r{1,2,3}.txt`: single-worker 2,947,892 / 2,764,489 / 2,945,326 → ≈2.9M IDs/s (200k IDs in 68 / 72 / 68 ms); 4 concurrent threads × 50k IDs → 200,000 unique, `duplicates: 0` in all three runs. Lease/expiry/failure semantics live in `id-issuer.test.ts` + `snowflake.test.ts`; this bench measures generation only. |

## Failure scenarios

| Scenario | Outcome |
|---|---|
| B + K shard-add migration (`scenario-K.txt`) | COMPLETED — live run `105573391162945536` (2026-10-19): 64 buckets moved, 8,801 rows copied (`estimatedRows` = `copiedRows` in `migration_runs.metrics`), checksum verify passed, directory counts equal, gates reopened. Task 8 tests: migration.test.ts 2/2, migration-gate.test.ts 3/3 (drain, stale writer, rollback), fence-coverage.test.ts 1/1. The earlier "134 rows" figure was the Phase 9 pilot count on the freshly seeded dataset; replaced per the evidence rule. K also caught and fixed a snapshot-staleness 404 (onboard → first action now 201 in ~0.06 s). |
| C replica scaling (`scenario-C.txt`) | NGINX round-robin across :4000/:4002/:4003 (6/6 probe via `x-api-instance`); mixed-medium with 3 backends: 0% failed, p95 62 vs single-replica medians 117 [27–120] (comparative, same laptop; balancing policy round-robin, `max_fails=2 fail_timeout=10s`). |
| D API kill + NGINX recovery (`scenario-D.txt`) | 0 failed of 6,330 reqs while one replica was killed mid-run; dead peer marked down after `max_fails=2`, retried after `fail_timeout=10s`; all-peers-down probe → 502 in ~7–10 ms; restarted replica rejoins with no intervention. |
| E worker kill/retry, payroll (`scenario-E.txt`) | Batch stays RUNNING with honest partial totals while the worker is dead; restart redelivery → COMPLETED 906 = 128 + 778; 0 duplicate (employee_id, period) rows on all 4 shards. |
| F Redis KV/queue outage (`scenario-F.txt`) | Fail-closed scopes → 503 in ≤2.1 s; fail-open scopes keep 200; refresh/logout 503 (was 500); queue POST bounded ≤2.4 s → `QUEUE_UNAVAILABLE` + honest FAILED batches, 0 phantom queue keys; healthy POST 202 → COMPLETED afterwards. |
| I shard-2 outage (`scenario-I.txt`) | Routed writes 503 `DEPENDENCY_UNAVAILABLE` @0.03 s; scatter reads 200 with `meta.partial` + `unavailable:["shard-2"]`; recovery idempotent (duplicate check-in returns the original row). |
| J catalog outage + local deadline (`scenario-J.txt`) | Login/search 503 in ~2.0 s; shard-local writes live to last-heartbeat + 20 s, then 503 `GATE_CLOSED` (@20.86 s observed); snapshot-routed reads 200; writes resume ≤ one heartbeat after postgres is ready (4.03 s). Worker survives (pool guard). |

## Limitations

- One laptop hosts stack + load generator; absolute numbers are comparative only.
- Dataset is small (190 people, <1k attendance rows); sharding benefits are structural, not visible at this scale.
- Moto S3 stands in for MinIO (registry proxy blocks the MinIO image); the adapter is unchanged.
- Candidate-domain audit delivery is best-effort via the shared dispatcher.

## Traceability (FR/NFR → module → evidence)

| Requirement | Module | Evidence |
|---|---|---|
| FR-01 invitation lifecycle | apps/api/src/routes/auth.ts | identity.test.ts (create/accept/dup/expire) + e2e register |
| FR-02 auth/session | auth/*, sessions.ts | identity.test.ts (rotate/reuse/logout/CSRF) + e2e login |
| FR-03 RBAC | middleware/auth.ts, role-aware UI | identity.test.ts denials + e2e |
| FR-04 employee CRUD | routes/employees.ts, dispatcher | employees.test.ts + e2e lifecycle |
| FR-05 search/autocomplete | routes/search.ts, routes/jobs.ts, topbar + public jobs | org suggest fallback + jobs-suggest.test.ts + e2e directory |
| FR-06 attendance | routes/attendance.ts | attendance-leave.test.ts + e2e + burst run |
| FR-07 leave chain | routes/leave.ts | attendance-leave.test.ts (6) + e2e |
| FR-08 payroll | routes/payroll.ts, payroll-chunk | payroll.test.ts + core math + e2e |
| FR-09/10 recruitment | routes/jobs.ts, applications.ts | recruitment.test.ts + e2e hiring |
| FR-11 crawler | worker/crawl.ts, portal | sourcing.test.ts + core parser |
| FR-12 performance | routes/performance.ts | performance.test.ts + e2e cycle |
| FR-13 notifications | routes/notifications.ts, dispatcher | leave/payroll/review tests + Mailpit |
| NFR-RL-01 rate limit | core/rate-limit.ts | identity burst 429 + ratelimit run |
| NFR-DATA-01 sharding | ShardRouter, 4 shards | seed-routing + gate + migration tests |
| NFR-CH-01 hashing | core/ring.ts | golden vectors, map-equality, ring bench |
| NFR-MIG-01/02 migration | migration/runner.ts | migration.test.ts COMPLETED |
| NFR-ID-01 IDs | core/snowflake.ts, leases | unit + interleave tests + bench-id raws |
| NFR-QUEUE-01 queue | BullMQ adapter | queue round-trip + payroll rerun |
| NFR-OUTBOX-01 outbox | core/dispatcher.ts | version-guard + rebuild tests |
| NFR-AUDIT-01 audit | audit.ts, outbox AUDIT | atomicity tests + admin UI |
| NFR-URL-01 short links | routes/jobs.ts | recruitment.test.ts (allow-list, redirect) |
| NFR-CRAWL-01 crawler | worker/crawl.ts | sourcing.test.ts rerun-zero |
| NFR-KV-01 KV | redis-kv, outage policy | fail-open search test + outage run |
| NFR-OBS-01 observability | /metrics, Prometheus, Grafana | scrape verified |
| NFR-EVAL-01 evaluation | tests/load, tests/bench | this document |
| NFR-SEARCH-01 autocomplete | core/autocomplete.ts, routes/search.ts, routes/jobs.ts | org topbar suggest + jobs-suggest.test.ts + bench-suggest raws |

---

## §34 acceptance walk (final verification, 2026-10-19)

Every item in PRD §34 (88 checklist lines: 20 functional, 47 system-design, 6 infrastructure,
15 evaluation) walked once against the final branch HEAD. Pointers are committed raw files under
`docs/experiments/raw/`, automated tests (`apps/api/test/`, `packages/core/test/`), e2e titles
(`apps/web/e2e/hrms.spec.ts`), or the artifact that demonstrates the item.

**Gates (final HEAD):** `npm run ci` exit 0 — typecheck 5/5 workspaces; lint markers; `pool-access-ok`;
`shard-owned-tables-ok (owned: 16, declared: 16)`; API suite 24 files / 73 passed | 1 skipped; core
13 files / 40 passed | 4 skipped. `npm --workspace @hrms/web run build` clean; Playwright e2e 14/14
against the production build. `git status` clean at the walk.

### Functional (20)

| §34 item | Evidence |
|---|---|
| Activate invitation; concurrent duplicates → ≤1 employee; crash retries → same employee | `identity.test.ts` (create/accept/dup/expire) + `fence-coverage.test.ts` (invite → onboard → first action) + e2e "invitation acceptance creates an account" |
| Login / logout | `auth.test.ts` + `identity.test.ts` (refresh rotation, reuse detection) + e2e "HR logs in and sees live dashboard" |
| Passwords hashed with Argon2id | `identity.test.ts` + `infrastructure/postgres/seed.cjs` (argon2id demo hashes) |
| Resume upload validation; random object keys | `recruitment.test.ts` (oversize, declared-type, magic-byte rejections) + storage adapter random keys |
| Role-based access enforced | `identity.test.ts` denials + `admin-users.test.ts` (HR refused) + e2e role-gated navigation |
| Profile view/update per permissions | `employees.test.ts` + `employees-activity.test.ts` + e2e "profile save keeps header, department, and status intact" |
| Record attendance | `attendance-leave.test.ts` + `attendance-reports.test.ts` + `burst-r{1,2,3}.txt` + e2e "attendance check-in and check-out" |
| Apply for leave | `attendance-leave.test.ts` + e2e "leave flows from apply to approval" |
| Manager/HR approve or reject leave | `attendance-leave.test.ts` (approve / reject / HR override) + same e2e flow |
| HR manages employees | `employees.test.ts` + e2e "HR onboards, edits, and deactivates an employee" |
| HR runs payroll | `payroll.test.ts` + e2e "payroll runs and payslip opens" |
| Payroll executes asynchronously | `payroll-retry.test.ts` + `scenario-E.txt` (batch honest-partial while worker dead; completes on restart) |
| View payroll/payslips | e2e "payroll runs and payslip opens" + `payroll.test.ts` |
| HR creates job openings | `recruitment.test.ts` + e2e "public hiring flow works without login" |
| Candidates can apply | `recruitment.test.ts` + same e2e |
| HR manages candidates/applications | `recruitment.test.ts` + e2e hiring flow |
| Recruitment stages update | `recruitment.test.ts` (stage machine) + e2e hiring flow |
| Sourcing via simulated portal | `sourcing.test.ts` (repeat crawl, zero duplicates) + e2e "sourcing run completes and pool grows" |
| HR/manager performance reviews | `performance.test.ts` + e2e "performance cycle to released review" |
| Notifications for key events | `announcements.test.ts` + leave/payroll/review notification paths + Mailpit (`infra.test.ts` send → retrieve) |

### System Design (47)

| §34 item | Evidence |
|---|---|
| Rate limiter implemented and measurable | `ratelimit-r{1,2,3}.txt` (rejection 0.980–0.987; only 401/429 observed) + identity burst 429 + Grafana `api-overview` 429-by-scope + D-019 |
| 3 shards active, catalog separate, standby available | compose (catalog 5438; shards 5439–5442) + `seed-routing.test.ts` (active map on shards 1–3) + standby shard-4 activated live in `scenario-K.txt` |
| /admin/shards Admin-only, audited; preconfigured IDs only | `migration.test.ts` (preview/migrate; bogus + non-preconfigured adds rejected; audit rows) + `admin.ts` `requireRoles("ADMIN")` |
| Fixed-bucket routing deterministic across replicas; versioned ring | `routing-cache.test.ts` + `map-equality.test.ts` + scenario C (3 replicas behaved identically) + D-015 |
| Golden UUID→bucket vectors; map equals ring | `golden-vectors.test.ts` + `bucket.test.ts` + `map-equality.test.ts` |
| CI fails on undeclared employee/candidate-owned table | `scripts/check-shard-owned-tables.mjs` wired into `npm run ci` (migration `bucket_id` tables ↔ `docs/shard-owned-tables.md`; 16/16 today) |
| Consistent hashing in ShardRouter; benchmarked vs modulo | `bench-ring-r{1,2,3}.txt` (remap 24.9% vs modulo 74.4%) + `ring.test.ts` + `shard-router.ts` |
| Redis as key-value store | `redis-kv` service (256 MB budget) + `kv.test.ts` + D-013 |
| Unique ID generation implemented and benchmarked | `snowflake.test.ts` + `id-issuer.test.ts` + `bench-id-r{1,2,3}.txt` (≈2.9M IDs/s single worker; 0 duplicates across 4 concurrent threads) |
| URL shortener integrated into recruitment | `recruitment.test.ts` (allow-list, redirect) + `shortRouter` + D-019 `short` scope |
| Web crawler integrated into sourcing | `sourcing.test.ts` + `crawler.test.ts` + worker crawl jobs |
| Autocomplete org + public jobs; candidates never suggested | `jobs-suggest.test.ts` (index hit, catalog fallback, candidate exclusion, removal on close) + org topbar suggest (`app-shell.tsx`) + `bench-suggest-r{1,2,3}.txt` + D-009 |
| Shard-add: preview, fences, drain, GATED, acks, outbox drain | `migration.test.ts` + `migration-gate.test.ts` + live run `105573391162945536` (`scenario-K.txt`) |
| Stale writer cannot commit; no-deadline writer refused; durable gates | `migration-gate.test.ts` (stale writer, rollback) + `scenario-J.txt` (deadline) + K (gates survived process restarts) |
| shard_write_gate + single fenced wrapper + gate test + CI pool rule | `gate.test.ts` + `fence-coverage.test.ts` + `scripts/check-direct-pool-access.sh` + D-007/D-020 |
| Copy every manifest table; verify counts/checksums/relationships; smoke; switch after verification | `migration.test.ts` + `scenario-K.txt` (64 buckets, 8,801 rows = estimate, checksums passed, directory counts equal) + `docs/shard-owned-tables.md` |
| Acks before writes resume; failed smoke reverts map | `migration-gate.test.ts` (rollback) + `scenario-K.txt` |
| Post-cutover counts equal via active-map filtering | `scenario-K.txt` (directory counts equal) + `load-active-map.test.ts` + `reports.test.ts` |
| Failed copy/verify leaves old map; retry without dup/loss | `migration-gate.test.ts` + `scenario-K.txt` (post-fix rerun semantics) |
| Removal preview/unit-test only; no drain claimed | `admin.ts` preview rejects non-standby adds + `migration.test.ts` bogus-preview rejections + Limitations (no removal capability claimed) |
| Stop one shard: direct fails clear, healthy continue, search partial | `scenario-I.txt` (routed writes 503 @0.03 s; scatter 200 with `meta.partial`; idempotent recovery) |
| Stop catalog: login blocked safely; never guesses a shard | `scenario-J.txt` (login/search 503 in ≈2.0 s) + `routing-cache.test.ts` fail-closed + `catalog-gate.test.ts` |
| Registered writes until local deadline; new processes unready; no per-write registry query | `scenario-J.txt` (stop at 20.86 s) + `registration.test.ts` + `id-issuer.test.ts` + snapshot reads (`routing-cache.ts`) |
| No automatic gate reopening; resume requires recovery + acks + smoke | `migration-gate.test.ts` + `scenario-J.txt` |
| Abort-before-copy reopens only own-epoch markers via CAS | `migration-gate.test.ts` (rollback CAS) |
| Seed tooling uses canonical router; golden UUIDs; destination = active map | `seed-routing.test.ts` |
| Cutoffs ≈20 s registration / ≈45 s ID lease; earlier deadline binds | `scenario-J.txt` (20.86 s observed) + `id-issuer.test.ts` (45 s window; registration stops first) + D-017 |
| Phase 1a login local-only, no limiter, no Redis sessions | `docs/status.md` Phase 1a block + Phase 1a commit trail (historical checkpoint) |
| Failed shard tx keeps neither mutation nor AUDIT; committed mutation keeps durable audit; replay = one record | `fence-coverage.test.ts` (fenced writes + audit outbox atomicity) + `dispatcher.test.ts` (idempotent by event ID) |
| Catalog control-plane mutations fail if audit cannot commit | `catalog-gate.test.ts` + `admin-users.test.ts` (503 while catalog gate closed) |
| Invitations contain no salary; salary only post-creation on the owning shard | `identity.test.ts` (reservation payload) + `payroll.test.ts` (structures per employee on the owning shard) |
| CATALOG_DATABASE_URL → pg-catalog; shard-4 configured not active; client endpoints rejected | `.env.example` + compose + `seed-routing.test.ts` (active map shards 1–3) + `migration.test.ts` (non-preconfigured adds rejected) |
| Concurrent same-email invitations → ≤1 identity | `identity.test.ts` (concurrent dup) |
| Concurrent candidate imports same email reuse identity or HR review | `recruitment.test.ts` (apply/crawl dedupe) |
| Employee changes propagate via outbox and idempotent consumers | `dispatcher.test.ts` + `employees.test.ts` (deactivate removes + rebuild repairs) |
| Limiter deterministic across 3 replicas; zero false rejections | `ratelimit-r{1,2,3}.txt` (only 401/429 observed) + identity burst (429 only past capacity) + `rate-limit.ts` shared Lua token bucket |
| Shortener rejects off-allow-list; collision/retry test | `recruitment.test.ts` |
| Repeat crawl → no duplicate candidates | `sourcing.test.ts` (rerun-zero) |
| KvStore TTL + atomic ops incl. concurrent token buckets | `kv.test.ts` + shared Lua limiter exercised by the ratelimit run |
| redis-kv loss: no PG corruption; documented per-feature policy | `scenario-F.txt` (fail-closed 503, fail-open 200, bounded queue errors) + D-013/D-019 |
| Snowflake leases durable in pg-catalog; fail closed after expiry−margin; zero dup concurrent | `id-issuer.test.ts` + `snowflake.test.ts` + `bench-id-r{1,2,3}.txt` (0 duplicates) + D-017 |
| Catalog-outage readiness requires valid lease; no dup after recovery | `scenario-J.txt` (new processes unready) + `id-issuer.test.ts` |
| Outbox consumers idempotent; out-of-order safe; DL visible; rebuild repairs | `dispatcher.test.ts` (event-ID idempotency, version guard) + `employees.test.ts` (rebuild repairs a lost projection) |
| Deactivation removes autocomplete + sessions; access TTL documented as bound | `employees.test.ts` (suggestions removed) + `admin-users.test.ts:170` (login blocked, sessions revoked, audited) + auth session TTL constants |
| Leave tests: no-manager fallback, HR/Admin fallback, self-approval rejection, reassignment | `attendance-leave.test.ts` (all four cases) |
| Payroll worker kill → zero duplicate employee-period rows | `scenario-E.txt` (0 duplicates across all 4 shards) + `payroll-retry.test.ts` |
| Status-token + short-code enumeration rate-limited | `applications.ts:182` + `jobs.ts` shortRouter use `shortLinkLimit` (60/60 s) + `recruitment.test.ts` + D-019 |

### Infrastructure (6)

| §34 item | Evidence |
|---|---|
| Multiple API instances run locally | `scenario-C.txt` (3 replicas; `x-api-instance` 6/6) |
| NGINX load balances API instances | `scenario-C.txt` (round robin) + `scenario-D.txt` (kill/recovery; all-dead 502; rejoin) |
| Worker runs independently of the API | `scenario-E.txt` (worker killed mid-batch; API unaffected) + `scenario-J.txt` (worker survives catalog outage) + worker `/metrics` |
| Prometheus collects metrics | `infrastructure/monitoring/prometheus.yml` (api, worker, 5× postgres-exporter, 2× redis-exporter, cadvisor) + alerts; observability profile verified in Phase 10b |
| Grafana visualizes metrics | `infrastructure/grafana/dashboards/` (`api-overview`, `worker-queue`, `shards-redis`) + provisioning |
| k6 generates workload | all load raws under `docs/experiments/raw/` (k6 v2.2.0; JSON summary + exit 0 as the record) |

### Evaluation (15)

| §34 item | Evidence |
|---|---|
| Low workload completed | `mixed-low-r{1,2,3}.txt` row (p95 median 71 [49–75] ms) |
| Medium workload completed | `mixed-medium-r{1,2,3}.txt` row (p95 median 117 [27–120] ms) |
| High workload completed | `mixed-high-r{1,2,3}.txt` row (p95 median 41 [29–71] ms) |
| p50/p95/p99 per run; median + range across runs | Workload table (per-run values, median [range]; percentiles never averaged) per `00-method.md` |
| Throughput measured | Table throughput column (≈8.5 / 26.4 / 55.1 req/s; burst row too) |
| Success/error rate measured | `http_req_failed` 0% in all mixed rows; burst failed 0% |
| Resource usage measured | `resource-snapshot.txt` (docker stats) + `00-method.md` per-run sampling + cAdvisor/Grafana continuous |
| Component-specific metrics measured | Grafana dashboards + `/metrics` (op-tagged histograms, `rate_limit_*` counters) + worker metrics |
| Write-fence overhead ≥3 warmed runs with deltas | `bench-fence-r{1,2,3}.txt` row (overhead median 24.2% [−3.9–37.6%]; per-run p50/p95 absolute) + D-008 |
| At least one baseline comparison | Ring vs modulo (24.9% vs 74.4%); autocomplete Redis vs indexed catalog; fence vs bare; limiter overload |
| At least one scalability/failure scenario | `scenario-C/D/E/F/I/J/K.txt` |
| Shard distribution evaluated | Ring owners per shard across 4 nodes (bench-ring row) + `seed-routing.test.ts` + K moved 64 buckets |
| Server/load distribution evaluated | `scenario-C.txt` (6/6 round-robin across 3 backends under mixed-medium) |
| Shard-add migration copies/verifies/cuts over; gate read/write counts reported | `scenario-K.txt`: COMPLETED — gate-window probes, 8,801 rows, checksums, counts equal, gates reopened; no incomplete stage |
| Bottlenecks and trade-offs documented | Limitations section (this document) + `docs/decisions.md` (D-001–D-020) |
