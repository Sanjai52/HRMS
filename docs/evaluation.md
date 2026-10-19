# Evaluation (measured only)

Method: [00-method.md](experiments/00-method.md). Demo targets are the scripted acceptance
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

## Component comparisons (fair baselines)

| Comparison | Result |
|---|---|
| Consistent hashing vs modulo (20k keys, add node) | `bench-ring-r{1,2,3}.txt`: ringRemapPct 25.4 / 24.9 / 24.8 → median 24.9% [24.8–25.4%]; moduloRemapPct 74.4 / 74.5 / 74.4 → median 74.4% [74.4–74.5%]. Ring owners after add (shard-1 / 2 / 3 / 4): 5846 / 5830 / 5829 → 5830 [5829–5846]; 4114 / 4289 / 4221 → 4221 [4114–4289]; 4952 / 4905 / 4998 → 4952 [4905–4998]; 5088 / 4976 / 4952 → 4976 [4952–5088]. The shard-4 migration run is recorded under Failure scenarios. |
| Autocomplete Redis vs indexed catalog | `bench-suggest-r{1,2,3}.txt` (60 cold + 60 warm queries per run, GAP_MS=1100 pacing ≈0.9 req/s): cold `baselineIndexedCatalog` p50 25.08 / 24.79 / 24.63 ms, p95 32.40 / 26.99 / 26.98; warm `redisPrefixCache` p50 25.01 / 24.62 / 24.85, p95 26.69 / 26.76 / 26.60. Both legs report `sources: ["catalog"]` (avgResults 1.3) — the prefix cache never served in this stack state, so the measured delta is catalog-vs-catalog, not cache-vs-catalog. |
| Write-fence overhead vs benchmark-only control | `bench-fence-r{1,2,3}.txt` (single-row UPDATE on shard-1 `bench_probe`, 200 iters per internal run; 3 internal runs per file): overheadPct 37.6 / 21.5 / 12.8 (r1), −3.9 / 35 / 24.2 (r2), 25 / 22.7 / 24.2 (r3) → median 24.2% [−3.9–37.6%]. `fencedMs` p50 6.26–7.18 ms vs `bareMs` p50 5.04–7.47 (p95 8.22–20.01 vs 7.88–19.12) — fence cost is within run-to-run noise at this scale (one negative reading). |
| Rate limiter under overload | `ratelimit-r{1,2,3}.txt` (bad-credential login, 40 iters/s × 60s, no bypass): rejected_429 2351 / 2367 / 2369 of 2400 / 2400 / 2401 requests → rejection_rate 0.980 / 0.986 / 0.987 (median 0.986 [0.980–0.987]); login-tag p50 3 ms / p95 5 ms all runs; only 401/429 observed — the endpoint held. |
| Scatter vs single-shard read | reported with limits (see experiments) |

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
| FR-05 search/autocomplete | routes/search.ts, topbar | suggest fallback + e2e directory |
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
| NFR-ID-01 IDs | core/snowflake.ts, leases | unit + interleave tests |
| NFR-QUEUE-01 queue | BullMQ adapter | queue round-trip + payroll rerun |
| NFR-OUTBOX-01 outbox | core/dispatcher.ts | version-guard + rebuild tests |
| NFR-AUDIT-01 audit | audit.ts, outbox AUDIT | atomicity tests + admin UI |
| NFR-URL-01 short links | routes/jobs.ts | recruitment.test.ts (allow-list, redirect) |
| NFR-CRAWL-01 crawler | worker/crawl.ts | sourcing.test.ts rerun-zero |
| NFR-KV-01 KV | redis-kv, outage policy | fail-open search test + outage run |
| NFR-OBS-01 observability | /metrics, Prometheus, Grafana | scrape verified |
| NFR-EVAL-01 evaluation | tests/load, tests/bench | this document |
