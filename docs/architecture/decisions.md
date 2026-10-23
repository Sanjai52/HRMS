# Architecture Decision Log

**Project:** Scalable HRMS — UCS3513 System Design Laboratory
**Date recorded:** 2026-10-10
**Status:** Initial configuration baseline for Phase 1a
**Rule:** These are explicit prototype defaults, not measured performance results. Keep all processes on the same ring configuration. Change a value only with a dated rationale and rerun the affected tests.

## D-001 — Consistent-hash ring virtual-node count

- **Chosen value:** `V = 128` virtual nodes per physical shard.
- **Context:** The ring needs deterministic placement and adequate distribution without excessive ring metadata for this small academic deployment.
- **Alternatives considered:** 64 (less metadata, potentially coarser distribution); 256 (more ring points and metadata).
- **Consequences:** All API replicas, workers, migration tooling and tests must use the same value. Record bucket distribution and remapping in evaluation; `V` is not changed mid-run.
- **Tests:** Golden ring vectors; materialized map equals ring output; distribution/remapping comparison against modulo.

## D-002 — Process registry heartbeat and local validity

- **Chosen values:** heartbeat every `5 s`; registry row TTL `30 s`; stop-write safety margin `10 s` before the TTL-based local deadline.
- **Context:** Existing processes may temporarily continue eligible shard-local operations during a catalog outage, but may not trust registration indefinitely.
- **Operational interpretation:** Compute the registry deadline using the local monotonic clock, measured from the heartbeat request's send time plus the configured `30 s` TTL, not from the catalog's wall-clock `expires_at`. Stop writes at `heartbeat send time + TTL − 10 s` (about 20 s after the last successful heartbeat request send time); do not require a synchronous catalog registry query on each business write. A process unable to register is unready. The local deadline is a safety boundary, not proof that a migration fence has been acquired.
- **Tests:** heartbeat renewal, missed heartbeat, catalog outage, process pause/resume, monotonic local deadline expiry and readiness behavior. Under the configured values, assert the registration write cutoff is approximately 20 s after the last successful heartbeat request send time.

## D-003 — Worker-ID lease timing

- **Chosen values:** lease TTL `60 s`; heartbeat/renewal interval `10 s`; stop-generation safety margin `15 s` before local lease expiry.
- **Context:** Snowflake-style IDs require exclusive worker-ID ownership and fail-closed behavior when lease validity becomes uncertain.
- **Consequences:** Stop generating IDs at `localLeaseExpiry − 15 s`; fail closed after that point. Registry validity and worker-ID lease validity are separate contracts; whichever deadline expires first limits the process.
- **Tests:** concurrent lease acquisition, renewal, catalog outage, expiry/reclaim, process pause and recovery with zero duplicate IDs. With the configured values, assert ID generation stops by approximately 45 s after the last successful lease-renewal request send time; separately assert that D-002 registration validity stops all shard writes earlier, at approximately 20 s.

## D-004 — Migration gate polling and acknowledgement

- **Chosen values:** process gate-state/epoch polling interval `250 ms`; gate acknowledgement timeout `10 s` after the gate is published to the process registry; exclusive-fence acquisition timeout `10 s` per attempt. If a live migrator hits a timeout before any copy starts or routing-map change occurs, it may abort and compare-and-set only the `GATED` markers it set for that same epoch back to `OPEN`. If the migrator is dead/unreachable, epoch/state is ambiguous, copying has started, or the map has changed, gates remain closed until explicit recovery.
- **Context:** Polling helps coordinate process acknowledgements, but it is not the correctness fence. Durable per-shard gate markers and transaction-scoped shard fences enforce write exclusion.
- **Consequences:** No copy starts until all unexpired processes acknowledge the gate epoch, all involved shard gates are durably `GATED`, and in-flight writes/outbox events are drained. A timeout never authorizes the migrator to assume a process is dead. Pre-copy reopening is permitted only for markers created by this migration epoch and only while the old routing map remains unchanged; compare-and-set must include both the expected `GATED` state and matching epoch.
- **Tests:** unresponsive process, lock contention, stale writer, catalog/migrator interruption, pre-copy timeout with same-epoch compare-and-set reopening, proof that a different epoch's marker is never reopened, and post-copy failure that keeps gates closed for explicit recovery.

## D-005 — Access-token TTL

- **Chosen value:** short-lived access token TTL `10 minutes`.
- **Context:** Phase 1a needs a minimal real authentication slice without Redis or refresh sessions. Later phases add the complete refresh-session and CSRF behavior.
- **Consequences:** The TTL is the maximum revocation bound for already-issued stateless access tokens unless a sensitive mutation performs a current-account/status check. Phase 1a must not implement refresh sessions as a hidden dependency.
- **Tests:** expiry rejection, malformed/expired token rejection, protected route authorization and documented deactivation/revocation behavior in later phases.

## D-006 — Phase 1a authentication and directory seed

- **Chosen approach:** seed one HR account with an Argon2id password hash and seed the catalog employee-directory projection directly using the seed script.
- **Explicit exclusions:** no Redis, refresh sessions, rate limiter, full invitation flow, or outbox-driven projection in Phase 1a. The seeded-login slice is local-only and must not be exposed on a public/shared network. Redis arrives in Phase 1b; the rate limiter and full authentication workflow arrive in Phase 2; outbox-driven projection arrives in Phase 3.
- **Tests:** login verifies the seeded hash and returns a short-lived access token; the authenticated dashboard reads the seeded catalog directory through the real API; no hard-coded authentication bypass or hard-coded directory response.

## D-007 — Fenced write boundary

- **Chosen approach:** one `ShardRouter` write wrapper acquires the target shard's transaction-scoped shared fence and checks `shard_write_gate` in the same transaction. The gate table exists on every employee shard. Application/domain code cannot access shard pools directly.
- **CI enforcement:** lint/CI bans direct shard-pool access outside `ShardRouter`; only named migration, seed, health/diagnostic and test infrastructure exceptions are allowed, and health/diagnostic exceptions must not mutate business data. Seed and migration tooling may bypass the normal shared-write fence only for explicitly scoped bootstrap/copy operations, but must still call `ShardRouter`'s canonical routing function/map to resolve bucket ownership and physical shard; they may not hard-code shard selection or reimplement bucket hashing. The benchmark-only no-fence control is isolated test code and cannot be imported or called by production application/domain modules.
- **Tests:** integration test proves `GATED` blocks writes; CI fixture proves an unauthorized direct pool access fails the rule; stale-writer test covers gate closure/cutover; seed test recomputes the canonical bucket for every seeded employee-owned row, checks fixed golden-vector seed UUIDs against expected buckets, and asserts that physical shard placement matches the active materialized routing map.

## D-008 — Fence-overhead evaluation

- **Chosen approach:** benchmark the fenced `ShardRouter` path against an isolated benchmark-only control executing the equivalent SQL operation without fence overhead. The unfenced control is not a production repository or application code path.
- **Protocol:** at least three warmed runs with identical dataset, SQL, transaction shape, pool limits, resources and request mix. Report per-run p50/p95/p99 latency, throughput, error rate, absolute and percentage deltas, and median/range. Do not invent results before running the experiment.

## D-009 — Autocomplete K, prefix cap, TTL and ranking

- **Chosen values:** `K = 20` newest suggestions per prefix (`packages/core/src/autocomplete.ts:4`), prefixes capped at `12` characters (`autocomplete.ts:3`), per-prefix sorted-set TTL `7 days` (`packages/core/src/dispatcher.ts:45`), ranking = recency: indexing writes `score = Date.now()` (`dispatcher.ts:40,43`) and reads take the newest first via `zrevrange` (`apps/api/src/routes/search.ts:23`); each prefix set is trimmed to the newest `K` members (`zremrangebyrank`, `dispatcher.ts:44`). The API clamps a caller-supplied `limit` to `K` (`search.ts:17`).
- **Context:** the deferred PRD §40C values. The cache stores gathered member strings per prefix under `autocomplete:org:all:<prefix>` (`autocomplete.ts:1-2,17-18`).
- **Jobs scope (PRD §9.8):** the public-jobs autocomplete uses the same K / prefix cap / TTL / recency rules under a separate key space `autocomplete:jobs:public:<prefix>` with members `jobId|title|slug` (`packages/core/src/autocomplete.ts`); jobs are catalog-owned so the index is written synchronously on create/close (`apps/api/src/routes/jobs.ts`, best-effort — a KV outage degrades to the indexed catalog fallback) and read by the public `GET /api/v1/jobs/suggest` endpoint. Candidate/private data never enters this key space.
- **Consequences:** a suggestion disappears after 7 idle days unless re-indexed; renames/reindexes surface immediately by bumping the score. No weighting knobs beyond recency.
- **Tests:** org suggest coverage in the API suite; `jobs-suggest.test.ts` (index hit, catalog fallback for queries beyond the 12-char cap, candidate exclusion, removal on close); `bench-suggest-r{1,2,3}.txt` in evaluation.md.

## D-010 — Candidate status-link token TTL

- **Chosen value:** `30 days` (`apps/api/src/routes/applications.ts:166`). The token is 32 random bytes hex (`applications.ts:160`), stored as a hash with a `revoked` flag; expired or revoked → `410 STATUS_EXPIRED` (`applications.ts:190`).
- **Context:** the public candidate status page has no login; the link is the credential.
- **Tests:** recruitment suite + e2e hiring/status flow.

## D-011 — Invitation expiry

- **Chosen value:** `7 days` (`apps/api/src/routes/auth.ts:109`; hiring invitations created from applications use the same interval, `applications.ts:513`). An expired or already-used invitation is marked `EXPIRED` and rejected with `410 INVITATION_EXPIRED` (`auth.ts:158-160`).
- **Tests:** identity.test.ts (expire case) + e2e register.

## D-012 — Upload size limit

- **Chosen value:** `5 MiB` (`5 * 1024 * 1024`) per resume, enforced by multer in memory storage (`apps/api/src/routes/applications.ts:47`).
- **Consequences:** oversized uploads fail before touching disk; the limit applies to the single `resume` field.
- **Tests:** e2e hiring flow covers the upload path; the cap is enforced by multer.

## D-013 — Redis KV memory budget and alert

- **Chosen values:** `redis-kv` runs with `--maxmemory 256mb --maxmemory-policy noeviction` (`docker-compose.yml:67`); Prometheus alerts when `redis_memory_used_bytes / redis_memory_max_bytes > 0.8` for 5 minutes (`infrastructure/monitoring/alerts.yml:3-10`).
- **Consequences:** `noeviction` means memory pressure surfaces as write errors rather than silent session/KV eviction; the 80% alert gives headroom before that.
- **Tests:** alert rule loaded by Prometheus (`observability` compose profile, alert visible as `RedisKvMemoryHigh`).

## D-014 — Workload targets and benchmark protocol

- **Chosen values:** k6 arrival-rate profiles `low = 10`, `medium = 30`, `high = 60` req/s (`tests/load/mixed.js:8`); thresholds overall `http_req_failed < 5%`, `p95 < 2000 ms`, `p99 < 4000 ms`, with tighter per-op limits (`mixed.js:28-35`); 9 AM burst `failed < 15%`, check-in `p95 < 3000 / p99 < 6000 ms` (`tests/load/burst.js:23-24`); fence benchmark protocol per D-008.
- **Context:** these are project targets from PRD §20.5, not production SLOs; measured medians live in `docs/evaluation.md`.
- **Tests:** the load raws themselves (`mixed-*-r*.txt`, `burst-r*.txt`).

## D-015 — Bucket count and hash metadata

- **Chosen values:** `256` buckets (`packages/core/src/bucket.ts:3`); bucket = first 4 bytes of the SHA-256 of the lowercased UUID, big-endian, mod 256 (`bucket.ts:5-9`); `128` virtual nodes per shard on the ring (`packages/core/src/ring.ts:12`); the active map is materialized per version in `routing_map_versions` / `routing_map_buckets` (`packages/core/src/shard-router.ts:52`).
- **Consequences:** the bucket count and hash are part of the data layout and only change with a migration; the map can move buckets between shards without rehashing.
- **Tests:** golden vectors + map-equality tests; ring bench in evaluation.md.

## D-016 — Payroll demo percentages

- **Chosen values:** the demo seed writes salary structures with `pf_pct = 12`, `tax_pct = 10`, `other_deductions = 0` (`infrastructure/postgres/seed-demo.cjs:85`); the calculator applies percentages to basic pay (`packages/core/src/payroll.ts:26`); HR can set any percent 0–100 (`apps/api/src/routes/payroll.ts:34`).
- **Tests:** payroll suite + core math + e2e cycle.

## D-017 — Registry write deadline

- **Chosen values:** heartbeat every `5 s` (`apps/api/src/registry.ts:6`), TTL `30 s` (`registry.ts:7`), margin `10 s` (`registry.ts:8`) → shard writes are refused once `TTL − margin = 20 s` have passed since the last successful heartbeat (`registrationValid`, `registry.ts:40`; `RegistrationExpiredError` → 503 `GATE_CLOSED`, `registry.ts:44`). The ID lease uses the same shape with TTL `60 s` / renewal `10 s` / margin `15 s` → local window `45 s` (`packages/core/src/leases.ts:18`), so the registration deadline always stops writes first during a catalog outage (D-002/D-003 ordering).
- **Env overrides:** `REGISTRY_TTL_MS`, `REGISTRY_MARGIN_MS` (`registry.ts:7-8`).
- **Tests:** scenario J (observed stop at last-heartbeat + 20.9 s); `id-issuer.test.ts` for the lease window ordering.

## D-018 — Password-reset TTL and single use

- **Chosen values:** reset tokens expire after `30 minutes` (`apps/api/src/routes/auth.ts:215`); single use enforced by `SELECT ... FOR UPDATE` on a `PENDING` row, otherwise the row is marked `EXPIRED` and the request rejected (`auth.ts:254-264`); issuing a new reset expires earlier PENDING ones (`auth.ts:213`).
- **Tests:** identity suite (reset flow) + e2e.

## D-019 — Rate-limit scopes

| Scope | Capacity / window | On limiter outage |
|---|---|---|
| login | 30 / 60 s | fail closed (503 `LIMITER_UNAVAILABLE`) |
| accept | 10 / 60 s | fail closed |
| search | 60 / 60 s | fail open |
| suggest | 120 / 60 s | fail open |
| jobs | 60 / 60 s | fail open |
| crawl | 6 / 60 s | fail open |
| apply | 10 / 60 s | fail closed |
| short | 60 / 60 s | fail closed |
| recover | 10 / 60 s | fail closed |

- **Source:** `apps/api/src/middleware/rate-limit.ts:67-75`. Identity is the user id when authenticated, else the client IP (`:44-45`); `RATE_LIMIT_BYPASS_IPS` is honored only outside production (`:14-21`). The `suggest` scope serves both autocompletes — org directory (`apps/api/src/routes/search.ts`) and public jobs (`apps/api/src/routes/jobs.ts`).
- **Tests:** identity burst 429s; scenario F (closed scopes 503 in ≤2.1 s, open scopes keep 200); `ratelimit-r{1,2,3}.txt`.

## D-020 — Worker direct-pool exception and idle-client guard

- **Chosen approach:** direct pool access is banned outside `ShardRouter` by `scripts/check-direct-pool-access.sh:7` with named exceptions (API pools, worker pools, health diagnostics, seeds/migrations, tests/benches); `shardPools` use is restricted to the API shard wrapper, migration, health and the worker wiring (`:18`). The worker builds its pools in `apps/worker/src/pools.ts` and every pool is wrapped by `guardPool` (`pools.ts:9-14`): an error on an *idle* client (shard restart, network blip, admin shutdown) is logged and the process keeps running — the next query acquires a fresh client and fails on its own if the dependency is still down.
- **Context:** `pg` pools are EventEmitters; an unhandled `'error'` on an idle client crashes the process. Observed live in scenario J (catalog stop, `57P01`); with the guard the worker logs `pg pool catalog idle client error:` and continues.
- **Tests:** check-direct-pool-access.sh in CI; scenario J (worker survives the catalog stop).

**Deferred-values status:** all values previously listed as deferred (invitation expiry, candidate-status token TTL, upload-size limit, autocomplete K/prefix cap/TTL/ranking, Redis memory budget, workload/benchmark targets) are now recorded above as D-009–D-020, each with its code source.
