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

## Values intentionally deferred

Other values named in the PRD—invitation reservation expiry, candidate-status token TTL, upload-size limit, autocomplete K/prefix cap/TTL/ranking weights, Redis memory budget and workload/benchmark targets—must be recorded before the corresponding feature or final evaluation. Numeric performance targets are selected after the pilot under PRD §20.5. They are not prerequisites for the Phase 1a walking skeleton unless a test or configuration requires them earlier.
