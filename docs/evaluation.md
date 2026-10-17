# Evaluation (measured only)

Method: [00-method.md](experiments/00-method.md). Targets below were set after the pilot
(2026-10-10) and are demo thresholds, not production SLOs. Smoke re-run on the current stack
(2026-10-17, no bypass — no 429s observed): p95 9.75 ms, 0.00% failed, 100% checks (121/121)
([smoke-r1.txt](experiments/raw/smoke-r1.txt)).

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
checkin p95<3000/p99<6000, failed<15%) — low and high raws show `✓`. The badge reflects
incremental threshold evaluation during the run, not the final verdict; the JSON summaries
(thresholds evaluate the same end-of-run data) are the record.

(Targets: low p95 < 500ms, medium p95 < 1000ms, high p95 < 2000ms, burst failed < 15%.)
Medians are inside all four targets (71 ms, 117 ms, 41 ms; burst failed 0%).

## Component comparisons (fair baselines)

| Comparison | Result |
|---|---|
| Consistent hashing vs modulo (20k keys, add node) | ring 25.1% remap vs modulo 74.2%; owners ~even (5019/4312/5778/4891). Physical rows moved in the shard-4 migration: 64 buckets, 134 rows verified by checksum. |
| Autocomplete Redis vs indexed catalog | `bench-suggest-r{1,2,3}.txt` (60 cold + 60 warm queries per run, GAP_MS=1100 pacing ≈0.9 req/s): cold `baselineIndexedCatalog` p50 25.08 / 24.79 / 24.63 ms, p95 32.40 / 26.99 / 26.98; warm `redisPrefixCache` p50 25.01 / 24.62 / 24.85, p95 26.69 / 26.76 / 26.60. Both legs report `sources: ["catalog"]` (avgResults 1.3) — the prefix cache never served in this stack state, so the measured delta is catalog-vs-catalog, not cache-vs-catalog. |
| Write-fence overhead vs benchmark-only control | `bench-fence-r{1,2,3}.txt` (single-row UPDATE on shard-1 `bench_probe`, 200 iters per internal run; 3 internal runs per file): overheadPct 37.6 / 21.5 / 12.8 (r1), −3.9 / 35 / 24.2 (r2), 25 / 22.7 / 24.2 (r3) → median 24.2% [−3.9–37.6%]. `fencedMs` p50 6.26–7.18 ms vs `bareMs` p50 5.04–7.47 (p95 8.22–20.01 vs 7.88–19.12) — fence cost is within run-to-run noise at this scale (one negative reading). |
| Rate limiter under overload | `ratelimit-r{1,2,3}.txt` (bad-credential login, 40 iters/s × 60s, no bypass): rejected_429 2351 / 2367 / 2369 of 2400 / 2400 / 2401 requests → rejection_rate 0.980 / 0.986 / 0.987 (median 0.986 [0.980–0.987]); login-tag p50 3 ms / p95 5 ms all runs; only 401/429 observed — the endpoint held. |
| Scatter vs single-shard read | reported with limits (see experiments) |

## Failure scenarios

| Scenario | Outcome |
|---|---|
| B shard-add migration | COMPLETED: 64 buckets, 134 rows, checksums match, directory counts equal, gates reopened |
| Shard-2 outage | — |
| Catalog outage | — |
| API kill + NGINX recovery | — |

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
