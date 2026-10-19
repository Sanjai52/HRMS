# Post-PRD Implementation Report — Scalable HRMS

> **What this document is:** the full story of what happened **after `PRD.md` (v2.5) was defined**.
> It answers three questions: **(1)** is everything the PRD listed done, **(2)** what are the
> prescribed system-design components, which were built, and how each was tested, and **(3)** what
> infrastructure exists today, how everything was verified, and what is explicitly not done.
>
> **Companion documents (source of truth, in priority order):**
>
> | Document | Contains |
> |---|---|
> | `PRD.md` | The specification (2 600+ lines): scope, phases §36, acceptance criteria §34, NFRs §40A, locked values §40C |
> | `docs/evaluation.md` | All measured numbers + the **88-item §34 acceptance walk** with per-item evidence pointers |
> | `docs/decisions.md` | Decision log **D-001 … D-020** (every locked/configured value with `file:line` citations) |
> | `docs/status.md` | Phase-by-phase build log (1a → 10c) |
> | `docs/api/overview.md` | API surface: route groups, RBAC, envelopes, limiter scopes |
> | `docs/shard-owned-tables.md` | Table ownership manifest (what lives on shards vs catalog) |
> | `README.md` | How to run everything (quick start, profiles, replica recipe, verify commands) |
> | `docs/experiments/00-method.md` | Measurement method for every run |
> | `docs/experiments/raw/` | ~100 committed raw artifacts (k6 JSON, bench outputs, scenario logs) |
> | `docs/superpowers/plans/2026-10-17-acceptance-gap-closure.md` | The 22-task closure plan executed in the final wave |
>
> **Repo state at publication:** GitHub `Sanjai52/HRMS` (private). Default branch
> `feat/remaining-8-11-plus-premium-ui` (complete work; `master` holds Phases 1a–7 baseline).
> HEAD `d8f3652`, 57 commits, working tree clean, all evidence committed.

---

## 1. Executive summary

**The PRD defined** a local-first, scale-focused HRMS: a modular Express monolith over **three
physical PostgreSQL shards + a separate catalog** database, with a fixed-bucket **consistent-hash
router**, Redis for sessions/rate-limit/KV/autocomplete, a **Snowflake-style ID generator**, a
**BullMQ worker**, an **NGINX** replica front, and eight prescribed system-design components
(PRD §8) woven into real workflows — evaluated with k6 under three workloads plus failure scenarios.

**What was delivered:** the complete product (auth/RBAC, employees, attendance, leave, payroll,
recruitment + candidate portal + crawler + URL shortener, performance, notifications, reports,
admin), the complete system-design set, a working **live shard-add migration** (run
`105573391162945536` on 2026-10-19), and a full evaluation program. All **88 items of PRD §34 were
walked individually**; the two that the original gap audit had missed (public-jobs autocomplete,
migration-ownership CI check) were found by the final walk and closed before sign-off.

**Verification at HEAD (all green, logs committed to the session temp dir, artifacts in-repo):**

| Gate | Result |
|---|---|
| `npm run ci` | exit 0 — typecheck 5/5 workspaces · lint · `pool-access-ok` · `shard-owned-tables-ok (16/16)` |
| API suite (serial, live stack, `MAIL_LIVE=1`) | **24 files / 73 passed, 1 skipped** (~190 s) |
| Core suite | **13 files / 40 passed, 4 skipped** |
| Web production build | clean (Next 15) |
| Playwright e2e (against the production build) | **14 / 14 passed** |
| `git status` / branch tip | clean / pushed to `Sanjai52/HRMS` |

**Explicitly out of scope (PRD-allowed):** Phase 11 (AWS deployment — PRD §40 marks it optional and
it was deferred by agreement); shard *removal* (PRD allows preview/unit-test-only in v1); advanced
analytics and the optional Firecrawl provider (P2 polish).

---

## 2. Timeline — from PRD to final sign-off

The PRD (`PRD.md`) was committed in the very first commit and drove ten delivery phases across
**2026-10-10 → 2026-10-19**. The ledger (`.superpowers/sdd/2026-10-17-acceptance-gap-closure/progress.md`)
keeps the operational detail; this is the executive timeline.

| Phase (PRD §36) | Dates | Scope delivered | Landmark commits |
|---|---|---|---|
| 1a — Walking skeleton | 10-10 | Express + Postgres + catalog; login only in a local-only setup; **no limiter / no Redis sessions** (later re-verified as a historical checkpoint, §34 item 28) | `670869b` and following |
| 1b — Remaining local infrastructure | 10-10 | Redis (queue + KV), S3 (moto), Mailpit, docker-compose base stack | — |
| 2 — Identity, RBAC, audit, rate limiting | 10-10 | Invitations, Argon2id, JWT + refresh rotation, roles ADMIN/HR/MANAGER/EMPLOYEE, audit log, first limiter scopes | — |
| 3 — Employee management, activation, directory | 10-10 | Employee lifecycle on shards, invitation→onboard, directory, **Snowflake IDs + durable worker-ID leases** | — |
| 4 — Attendance and leave | 10-10 | Check-in/out, duplicate check-in semantics, leave apply/approve chain with fallbacks | — |
| 5 — Payroll | 10-10 | Structures (paise integers), batch runs (chunked async), payslips, publish idempotency `UNIQUE(employee_id, period)` | — |
| 6 — Recruitment + URL shortener | 10-10 | Job openings, public board, applications, stage machine, allow-listed short links, hiring invitations | — |
| 7 — Candidate portal + crawler | 10-10 | Candidate-facing portal (`:4100` fixture), crawler + parsing + dedupe, sourcing runs | `f87e395` (tip of `master`) |
| 8 — Performance, reports, web completion | 10-18 | Review cycles/goals/released reviews, scatter-gather reports with `meta.partial`, full web UI | — |
| 9 — Shard-add migration control plane | 10-19 | Preview → fences → drain → GATED markers → acks → copy → checksum verify → smoke → same-epoch cutover → gates reopen; rollback path | `d998d67` (rollback) + following |
| 10a — Load/bench harness | 10-19 | k6 profiles (low/medium/high + 9 AM burst + rate-limit + smoke), ring/suggest/fence benches | — |
| 10b — Scale hardening | 10-19 | Catalog write gate `e7932ab`; shard write fences `17cbf99`; pool timeouts `8f251dc`; registration deadline `fccb464`; routing/identity snapshot `482e75c`; KvStore `2eee370`; bounded KV/queue outage `8e872dd`; NGINX replicas + trust proxy `b73d305`; worker/admin observability `463e970` (+ fixups `e0fa67c`, `561da93`) | — |
| 10c — Acceptance-gap closure (22 tasks) + final verification | 10-17→10-19 | The 2026-10-17 gap audit → closure plan: catalog-gate coverage, fence coverage, pool guard, registry deadline, KvStore, migration rollback tests, candidate-map seeding, password reset, partial-result flagging, audit completeness, admin users, UX/public polish, observability completion, scenario evidence (C–K), decisions/README/API docs, final walk | `354c7ae`, `fbefaa3`, `b73d305`, `463e970`, `5397928`, `290e156`, `8e872dd`, `f82fb91`, `482e75c`, `b2cba55`, `80f0e7b`, `b56da97`, `4cebfb9`, `d8f3652` |

**Total: 57 commits.** The last three phases were driven by the **2026-10-17 acceptance-gap
audit**, which produced a 22-task plan with a strict evidence rule: *every number in
`docs/evaluation.md` must trace to a committed raw file in `docs/experiments/raw/` (or a scenario
file), and any mismatch found during scenario runs is fixed in the owning task before a pass is
recorded.*

---

## 3. Compliance: is everything in the PRD done?

### 3.1 Functional requirements — all implemented and tested

| FR (PRD §7) | Status | Where implemented | How tested |
|---|---|---|---|
| FR-01 invitation lifecycle | ✅ | `apps/api/src/routes/auth.ts` | `identity.test.ts` (create/accept/dup/expire/concurrent) + `fence-coverage.test.ts` + e2e "invitation acceptance creates an account" |
| FR-02 auth/session | ✅ | `auth.ts`, sessions in Redis | `auth.test.ts` + `identity.test.ts` (refresh rotation, reuse detection, logout) + e2e login |
| FR-03 RBAC | ✅ | `middleware/auth.ts`, per-route `requireRoles` | `identity.test.ts` denials, `admin-users.test.ts` (HR refused) + e2e role nav |
| FR-04 employees | ✅ | `routes/employees.ts` (+`/me`, `/team`) | `employees.test.ts`, `employees-activity.test.ts` + e2e lifecycle/profile |
| FR-05 search/autocomplete | ✅ | `routes/search.ts` (org), `routes/jobs.ts` (public jobs) | org fallback tests + **`jobs-suggest.test.ts`** (new) + e2e directory + `bench-suggest-r*.txt` |
| FR-06 attendance | ✅ | `routes/attendance.ts` | `attendance-leave.test.ts`, `attendance-reports.test.ts` + e2e + 9 AM burst raw |
| FR-07 leave | ✅ | `routes/leave.ts` | `attendance-leave.test.ts` (7 cases incl. fallbacks, self-approval, reassignment) + e2e |
| FR-08 payroll | ✅ | `routes/payroll.ts` + worker chunks | `payroll.test.ts`, `payroll-retry.test.ts` + scenario E + e2e payslip |
| FR-09/10 recruitment | ✅ | `routes/jobs.ts`, `routes/applications.ts` | `recruitment.test.ts` + e2e public hiring |
| FR-11 crawler | ✅ | `apps/worker/src/crawl.ts` + core parser | `sourcing.test.ts` (repeat-crawl zero dupes) + e2e sourcing |
| FR-12 performance | ✅ | `routes/performance.ts` | `performance.test.ts` + e2e cycle→released review |
| FR-13 notifications | ✅ | `routes/notifications.ts` + dispatcher fan-out | announcements + leave/payroll/review tests + Mailpit round-trip (`infra.test.ts`) |

### 3.2 PRD §34 acceptance criteria — 88 / 88 walked ✅

The full per-item table lives in **`docs/evaluation.md` → §34 acceptance walk**. Summary:

| §34 category | Items | Result |
|---|---|---|
| Functional | 20 | All covered by API tests + 14 e2e flows |
| System Design | 47 | All covered — tests, live scenario raws, or CI guards (see §4/§5 below) |
| Infrastructure | 6 | Replicas, NGINX, independent worker, Prometheus, Grafana, k6 — all demonstrated with runtime evidence |
| Evaluation | 15 | Three workloads × 3 runs, medians/ranges, fences, baselines, failure scenarios, distribution, resources, limitations |

**The walk found exactly two genuinely unclosed items** (the earlier audit had missed both) — both
were fixed in the single permitted fix wave and re-verified:

1. **Public-jobs autocomplete** (PRD §9.8 / NFR-SEARCH-01) was never implemented — only the org
   directory scope existed. Now: `GET /api/v1/jobs/suggest` reads/writes the Redis prefix index
   `autocomplete:jobs:public:<prefix>` (written on job create/close, best-effort; indexed
   **catalog fallback** for queries longer than the 12-char prefix cap; `suggest` limiter scope,
   fail-open), plus a search box with suggestions on the public `/jobs` page. Covered by the new
   `apps/api/test/jobs-suggest.test.ts`: cache hit, catalog fallback, close-removal, and an
   adversarial assertion that **candidate/private data never appears**.
2. **Migration table-ownership CI check** (NFR-MIG-03) did not exist. Now:
   `scripts/check-shard-owned-tables.mjs` cross-checks every `bucket_id`-bearing table created by
   shard migrations against `docs/shard-owned-tables.md` (both directions) and runs inside
   `npm run ci` (`shard-owned-tables-ok (owned: 16, declared: 16)`).

Smaller fix-wave items: an **ID benchmark** (`tests/bench/id-bench.mjs` → `bench-id-r{1,2,3}.txt`:
≈2.9 M IDs/s single-worker, **0 duplicates** across 4 concurrent threads), a **resource snapshot**
(`resource-snapshot.txt`, docker stats), and a portability repair of the web `lint` script (the old
form used `next lint` — deprecated in Next 15 and interactive — plus a shell pipe that never parsed
under Windows `cmd.exe`; it now matches the repo's explicit `lint-*-ok` marker convention).

No `—` placeholder cells remain anywhere in `docs/evaluation.md`; the only remaining dash is prose.

### 3.3 Locked configuration values (PRD §40C) — all decided and recorded

`docs/decisions.md` holds **D-001 … D-020**, each with the chosen value and `file:line`
citations. The §40C deferrals resolved by D-009…D-020: autocomplete K=20 / prefix 12 / 7-day TTL /
recency ranking; candidate status token 30 d; invitation 7 d; upload cap 5 MiB; Redis-KV 256 MB +
80%/5 min alert; workload targets 10/30/60 rps; 256 buckets / SHA-256 first-4-bytes BE / 128
vnodes; payroll demo PF 12% / tax 10%; registry write deadline 30 s − 10 s margin = 20 s; reset
token 30 min single-use; nine rate-limit scopes with fail-open/closed policy; worker direct-pool
exception + idle-client guard. D-001…D-008 cover the ring vnode count, registry heartbeat/validity,
lease timing, gate polling/acks, access-token TTL, Phase 1a auth, the fenced write boundary, and
the fence-overhead evaluation protocol.

### 3.4 What is explicitly NOT done (and why that is compliant)

| Item | Status | Basis |
|---|---|---|
| Phase 11 — AWS/cloud deployment | Deferred | PRD §40 lists it as optional; the project was scoped to the local demonstration by agreement |
| Shard removal / data drain | Not implemented (by design) | PRD §34: "preview/unit-test only; no data-drain/removal capability is claimed in v1" — the preview API rejects anything but preconfigured standby adds |
| Advanced analytics / optional Firecrawl provider / expanded dashboards | Not built | PRD §8.1: P2 polish — "must not delay a complete local demonstration" |
| Sharding speed-up claims | Not claimed | PRD §20.1: numbers are comparative on one laptop; the evaluation says so |

---

## 4. The eight prescribed system-design components (PRD §8) — built, integrated, tested

PRD §8 maps eight components to real HR workflows and demands integration evidence — not toy
demos. Below: what the PRD asked, what exists, where, how it is tested, and the committed evidence.

### 4.1 Rate limiter

- **PRD intent:** protect login/recovery/public APIs/search/crawler; report allowed/rejected,
  rejection rate, latency, and behavior when Redis is down.
- **Built:** deterministic shared token bucket — Redis Lua script (`packages/core/src/rate-limit.ts`)
  so all API replicas count against the same bucket; nine scopes wired in
  `apps/api/src/middleware/rate-limit.ts:67-75` (login 30/60 s closed · accept 10 · search 60 open ·
  suggest 120 open · jobs 60 open · crawl 6 open · apply 10 closed · short 60 closed · recover 10
  closed; "closed" = 503 `LIMITER_UNAVAILABLE` when the limiter itself is down). Identity = user id
  when authenticated, else client IP; behind NGINX the real IP is resolved through a **narrow
  validated `trust proxy`** (`apps/api/src/trust-proxy.ts`, IPv4/IPv6/CIDR/hop-count, boot-time
  validation). `RATE_LIMIT_BYPASS_IPS` exists for load-test runs only and is inert when
  `APP_ENV=production`. Prometheus counters per scope (`rate_limit_allowed_total`,
  `rate_limit_rejected_total`).
- **Tested:** `ratelimit-r{1,2,3}.txt` — 40 bad logins/s × 60 s: rejection 0.980 / 0.986 / 0.987
  of ~2 400 requests, only 401/429 observed, login p50 3 ms / p95 5 ms. Identity-suite burst 429s.
  Scenario F proved the outage policy (closed scopes 503 in ≤2.1 s; open scopes keep 200).
  Decision: **D-019**.

### 4.2 Sharding (ShardRouter over 3 active physical shards + catalog)

- **PRD intent:** distribute employee-owned records across real PostgreSQL instances; per-shard
  distribution, skew, routing correctness.
- **Built:** employee/candidate-owned tables live on shards (`docs/shard-owned-tables.md` — 16
  tables, 10 employee + 6 candidate); `pg-catalog` (port 5438) holds control-plane data
  (users/roles, invitations, jobs, payroll config, cycles, routing maps, registry, leases,
  migrations, audit). `ShardRouter` (`packages/core/src/shard-router.ts`) routes every shard write
  through `withFencedWrite`; every read either targets one shard or fans out (scatter-gather) with
  `meta.partial` + `unavailable:[…]` honesty when a shard is down. Per-shard pools have timeouts
  (`8f251dc`). Direct pool access outside documented exceptions is **banned and CI-checked**
  (`scripts/check-direct-pool-access.sh` → `pool-access-ok`; exception policy **D-007/D-020**).
- **Tested:** `seed-routing.test.ts` (every stored bucket recomputes via the canonical router and
  lives on the active-map owner), scenario I (shard-2 outage: routed writes 503 @0.03 s; scatter
  reads 200 with `meta.partial`), scenario K (live 64-bucket move), `gate.test.ts` /
  `fence-coverage.test.ts` / `catalog-gate.test.ts`.

### 4.3 Consistent hashing (versioned ring)

- **PRD intent:** stable bucket→shard placement; limited remapping on shard add/remove;
  benchmarked against modulo on the same keys.
- **Built:** 256 fixed buckets; bucket = first 4 bytes of SHA-256 of the lowercased key, big-endian,
  mod 256 (`packages/core/src/bucket.ts`; **D-015**); 128 virtual nodes per shard on a versioned
  ring (`packages/core/src/ring.ts`; **D-001**); the ring output is materialized per version in
  `routing_map_versions` / `routing_map_buckets`, and API replicas serve routing from an in-process
  snapshot that is refreshed on each registry heartbeat (`packages/core/src/routing-cache.ts`).
- **Tested:** golden UUID vectors (`golden-vectors.test.ts`), map-equals-ring per version
  (`map-equality.test.ts`), `load-active-map.test.ts`, and the head-to-head bench:
  **`bench-ring-r{1,2,3}.txt` — remap on add: ring 24.9 % median [24.8–25.4] vs modulo 74.4 %
  [74.4–74.5]**; owners after add ≈ 5 830 / 4 221 / 4 952 / 4 976 (4 shards, 20 k keys) — a real
  distribution, not a synthetic-only claim.

### 4.4 Key-value store (Redis)

- **PRD intent:** sessions, rate-limit state, cache, autocomplete, temporary state; GET/SET
  behavior on loss; memory budget.
- **Built:** a narrow `KvStore` interface with a Redis adapter (`packages/core/src/kv.ts`, `2eee370`)
  over a dedicated `redis-kv` instance (port 6380) with `--maxmemory 256mb --maxmemory-policy
  noeviction` (**D-013**); queue traffic uses a separate `redis-queue` (port 6379) precisely so KV
  loss and queue loss are independent. Refresh tokens/session state, limiter buckets, the
  autocomplete index and temporary resets all live in KV.
- **Tested:** `kv.test.ts` (TTL + atomic ops), scenario F (KV loss: fail-closed scopes 503 ≤2.1 s;
  fail-open keep 200; no PostgreSQL corruption; queue POST bounded → honest 502/503; 0 phantom
  queue keys), `RedisKvMemoryHigh` alert rule (80 % for 5 min) loaded in Prometheus.

### 4.5 Unique ID generator (Snowflake-style)

- **PRD intent:** IDs/second, duplicate count under concurrent replicas, clock/sequence edges;
  no central sequence bottleneck.
- **Built:** 41/10/12-bit Snowflake layout, epoch 2026-01-01, decimal strings in JSON
  (`packages/core/src/snowflake.ts`); **worker IDs are leased durably in `pg-catalog` in a table
  separate from the process registry** (`worker_id_leases`, TTL 60 s / renew 10 s / margin 15 s →
  45 s local window; `packages/core/src/leases.ts`, **D-003/D-017**); generation fails closed after
  the lease deadline and on clock-backward.
- **Tested:** `snowflake.test.ts` (ordering, cross-worker collision, clock-backward refusal, lease
  deadline), `id-issuer.test.ts` (renewal failure keeps the window so the registration deadline
  binds first), `bench-id-r{1,2,3}.txt` — **≈2.9 M IDs/s single-worker; 200 000 unique, 0
  duplicates across 4 concurrent threads** in all three runs. During scenario J the ID cutoff
  (≈45 s) provably never fired before the registration deadline (first write 503 at 20.86 s).

### 4.6 URL shortener

- **PRD intent:** create/redirect latency, invalid redirects, collision handling; integrated into
  recruitment.
- **Built:** `POST /api/v1/short-urls` (HR/ADMIN) + public redirect `GET /api/v1/s/:code`
  (`apps/api/src/routes/jobs.ts`); **allow-list of internal destinations only** (external URLs
  rejected); random short codes with unique-retry on collision; `short` limiter scope (60/min,
  fail-closed — a redirect is cheap to protect); audit rows for creation.
- **Tested:** `recruitment.test.ts` — create → redirect → off-allow-list rejection → collision
  handling path; rate-limit coverage by scope (`D-019`); e2e hiring flow uses a short link.

### 4.7 Web crawler (candidate sourcing)

- **PRD intent:** bounded crawling of the project-owned simulated portal; pages/sec, extraction
  success, retries, duplicates, imports.
- **Built:** the **candidate portal** (`apps/candidate-portal`, port 4100) serves the simulated
  external portal with a fixed people fixture; the worker (`apps/worker/src/crawl.ts` +
  `packages/core/src/crawler.ts`) executes crawl jobs (BullMQ, scope `crawl` 6/min fail-open),
  parses/normalizes entries and **deduplicates by normalized email** into the candidate domain
  (own shards/outbox). Sourcing runs are visible in the UI with per-run stats.
- **Tested:** `sourcing.test.ts` — run completes, pool grows, **re-running the same crawl creates
  zero duplicates**; e2e "sourcing run completes and pool grows".

### 4.8 Autocomplete

- **PRD intent:** org directory + public jobs; permission-scoped; never treats cache as source of
  truth; Top-K relevance, freshness, latency.
- **Built (org):** outbox-driven indexing writes `autocomplete:org:all:<prefix>` (K=20 newest,
  prefix ≤12 chars, TTL 7 d, recency ranking via zset scores) from idempotent dispatcher consumers;
  `GET /api/v1/search/suggest` (HR/ADMIN/MANAGER) reads the cache and **falls back to an indexed
  catalog query** on miss; suggestions are permission-scoped (directory data only). **Built
  (public jobs, added in the fix wave):** same values, separate key space
  `autocomplete:jobs:public:<prefix>`, written synchronously on job create/close (jobs are
  catalog-owned; best-effort), read by public `GET /api/v1/jobs/suggest` with catalog fallback;
  consumed by a suggestion box on the public `/jobs` page. Candidate/private data never enters
  either org-side or jobs-side key space (asserted adversarially in `jobs-suggest.test.ts`).
- **Tested:** `bench-suggest-r{1,2,3}.txt` (honest caveat: the 2026-10 runs measured
  catalog-vs-catalog ≈25 ms p50 because the prefix cache never served in that stack state — the
  report says so rather than overclaiming), `employees.test.ts` (deactivate removes suggestions;
  rebuild repairs a lost projection), `jobs-suggest.test.ts` (hit / fallback / exclusion /
  removal). Decisions: **D-009** (+D-019 scope).

### 4.9 The connective tissue the PRD demanded around the eight

- **NGINX replica balancing:** `infrastructure/nginx/nginx.conf` round-robins `:4000/:4002/:4003`
  (`max_fails=2 fail_timeout=10s`), forwards client IPs and sets `/metrics` to 403 at the ingress.
  Verified in scenarios C (6/6 `x-api-instance` alternation) and D (0 of 6 330 requests failed
  while a replica was killed mid-run; all-dead probe → 502 in ~7–10 ms).
- **Independent worker:** All background work (notifications, payroll chunks, crawls, outbox drain
  assist) runs in `apps/worker` (metrics on `:4001`, 15 s queue poll). Verified by scenario E
  (worker killed mid-batch: batch honestly partial, restart completes; 0 duplicate
  employee-period rows) and scenario J (worker survives a catalog outage — one crash found and
  fixed via the idle-client pool guard `guardPool`).

---

## 5. Supporting architecture built beyond the eight

These systems are what make the eight believable — they were the majority of the post-PRD work.

### 5.1 Transactional outbox + dispatcher + audit atomicity (NFR-OUTBOX-01, NFR-AUDIT-01)

- Shard-local mutations commit a durable `AUDIT`/domain event **in the same transaction**
  (`outbox_events`, with `bucket_id`; candidate domain has its own `candidate_outbox`).
- `packages/core/src/dispatcher.ts` drains outboxes idempotently **by event ID**, with a
  **version guard** so out-of-order employee events cannot overwrite newer state; failed events
  retry to a 10-attempt ceiling and remain visible (dead-letter state); the admin
  **rebuild-directory** action repairs a deliberately lost projection.
- Catalog-owned control-plane mutations write their audit row **inside the same catalog
  transaction** and refuse to commit when the catalog write gate is closed
  (`catalog-gate.test.ts`, `admin-users.test.ts` → 503 while gated).
- A real bug found on the way: numeric Snowflake IDs used directly as BullMQ job IDs were rejected
  by BullMQ ("Custom Id cannot be integers") — fixed by prefixing (`notify-${event_id}`,
  `354c7ae`), with 35 parked `LEAVE_DECIDED` rows re-armed and proven against Mailpit.

### 5.2 Migration control plane: gates, fences, deadlines, acks (NFR-MIG-01…04)

The shard-add flow, all live-verified in run `105573391162945536` (`scenario-K.txt`):

1. **Preview** a versioned ring change (`POST /admin/shards/preview`, ADMIN-only, audited;
   non-preconfigured shard IDs rejected).
2. **Fence:** set the durable `shard_write_gate` GATED marker on every *involved* shard.
3. **Drain:** stop accepting fenced writes; wait for in-flight transactions.
4. **Ack:** every unexpired process acknowledges the new map version (registry acks).
5. **Copy** every applicable table per `docs/shard-owned-tables.md`, then verify per-table row
   counts, **checksums**, and relationship counts; **read-only smoke tests** run while gated.
6. **Cutover** via same-epoch compare-and-set; the map version switches only after verification.
7. **Gates reopen**; writes resume. Org-wide counts stay equal because reads/metrics filter to
   active-map-owned buckets.
8. **Abort path:** a live migrator that aborts before copy reopens only *its own epoch's* markers
   via CAS; any post-copy failure keeps gates closed for explicit recovery; a stale writer paused
   after its first gate check cannot commit after cutover. No catalog outage ever auto-reopens a
   gate.

Result: **64 buckets moved, 8 801 rows copied = estimate, checksums passed, directory counts
equal, gates reopened.** This run also exposed (and fixed) the snapshot staleness issue — onboarding
followed immediately by a self-service action 404'd for up to one heartbeat; the correction is a
**single-flight miss re-read** in `RoutingCache.employeeIdOf`: a miss always re-reads, concurrent
misses share one in-flight load, and a miss during a catalog outage fails closed. The full 24-file
suite is green on this final design.

### 5.3 Registry deadline + identity/routing snapshot (NFR-CAT-01/02)

Processes register in `pg-catalog` and heartbeat every 5 s (TTL 30 s, margin 10 s → **20 s local
write deadline**, D-002/D-017); the same heartbeat refreshes an in-process snapshot of (a) the
routing map and (b) user→employee identity, so the write path needs **no per-write catalog query**.
During a catalog outage, registered processes keep serving until the deadline (observed first
`GATE_CLOSED` 503 at 20.86 s in scenario J), new processes stay unready, reads that snapshot can
serve continue (200), and login/search fail fast (~2.0 s) instead of guessing. Recovery is
automatic within one heartbeat after Postgres is ready (4.03 s measured).

### 5.4 Queueing (BullMQ) and worker behavior (NFR-QUEUE-01)

Single BullMQ queue `hrms` (worker processors + gauges). Producers are **fail-fast bounded**
(`maxRetriesPerRequest: 1`, 2 s connect/command timeouts, skip-ready) so a Redis outage produces
honest 502/503 within ~2.4 s instead of hangs (`8e872dd`); consumers keep unbounded retries for
redelivery. Payroll batches are chunked per shard with idempotent per-shard bookkeeping — a killed
worker mid-batch completes on restart with **zero duplicate employee-period rows** (scenario E:
906 = 128 + 778).

### 5.5 Security posture (PRD §10, §39)

Argon2id passwords; short access tokens with rotation + reuse detection on refresh; CSRF-safe
cookie usage; invitation/reset/session state in Redis/KV; upload validation (5 MiB cap, declared
types, **magic-byte checks**) with random object keys that never leak filenames or shard IDs;
off-allow-list short-link rejection; metrics gated by token or internal peer + NGINX 403; narrow
trust proxy; direct-pool ban. Deactivation blocks login, revokes sessions and removes the employee
from autocomplete — access-token TTL is the documented revocation bound (D-005).

### 5.6 API surface (see `docs/api/overview.md`)

Uniform envelopes (`{success:true,data}` / `{success:false,error:{code,message,details?}}`),
`x-request-id` on every response, `x-api-instance` per replica, grouped routes with explicit RBAC
and limiter scopes across auth / employees / attendance / leave / payroll / jobs / recruitment /
sourcing / reports / performance / notifications / search / admin / short links / public /
health / metrics / env-gated test helpers.

---

## 6. Infrastructure inventory (what actually runs)

### 6.1 Docker Compose — base profile (always on)

| Container | Image (family) | Host port(s) | Purpose |
|---|---|---|---|
| `pg-catalog` | postgres | 5438 | Control plane: users/roles, invitations, jobs, payroll config, cycles, routing maps, registry, leases, migrations, audit |
| `shard-1 … shard-4` | postgres ×4 | 5439 / 5440 / 5441 / 5442 | Employee-owned data on 1–3 + candidate data; **shard-4 = pre-provisioned standby** (configured, not active) |
| `redis-queue` | redis | 6379 | BullMQ queue state |
| `redis-kv` | redis (256 MB, noeviction) | 6380 | Sessions, rate-limit buckets, autocomplete index, temporary state |
| `s3` | moto server | 5000 | Object storage (resume uploads) — stands in for MinIO, adapter unchanged |
| `mailpit` | axllent/mailpit | 1025 / 8025 | Local SMTP + web inbox for notification evidence |
| `candidate-portal` | node express fixture | 4100 | Simulated external portal that the crawler sources from |
| `nginx` | nginx | 8080 → 80 | Replica load balancing + ingress guards |

### 6.2 Docker Compose — `observability` profile

| Container | Host port | Purpose |
|---|---|---|
| `prometheus` | 9090 | Scrapes 10 targets; loads `alerts.yml` |
| `grafana` | 3001 (admin/admin) | 3 provisioned dashboards: `api-overview`, `worker-queue`, `shards-redis` |
| `cadvisor` | 8081 | Container CPU/memory |
| `postgres-exporter-catalog` + `-shard-1…4` | 9101–9105 | Per-database metrics |
| `redis-exporter-queue` / `-kv` | 9121 / 9122 | Redis metrics (memory vs budget, ops) |

Verified state: **10/10 Prometheus targets UP**; worker `:4001/metrics` live (queue
waiting/active/completed/failed gauges, 15 s poll); `RedisKvMemoryHigh` rule active.

### 6.3 Host processes (Windows dev machine)

| Process | Port | Notes |
|---|---|---|
| API replica ×3 | 4000 / 4002 / 4003 | `tsx` dev servers; all identical; behind NGINX |
| Worker | 4001 | BullMQ processors + metrics server |
| Web (Next 15 prod build) | 3000 | `next start` after `next build`; e2e target |

### 6.4 Data, migrations, seeds

- **21 migration files** (`infrastructure/postgres/migrations/001…020` + README): catalog and shard
  schema split by filename convention; **immutable once executed** — changes always land as a new
  `NNN_*.sql` (PRD §40B rule, enforced socially + by review; the runner records versions in
  `schema_migrations`).
- **Seed:** deterministic demo data — 190 people, ~826 attendance rows, 24 salary structures,
  8 candidates; golden-vector UUIDs embedded for routing assertions. Dev DBs accumulate
  intentionally (never reset/reseeded during the project after seeding).

### 6.5 Load & benchmark harness

- `tests/load/`: `mixed.js` (arrival-rate low/medium/high with per-op thresholds), `burst.js`
  (9 AM check-in burst), `ratelimit.js` (bad-credential flood, custom 429 counter), `smoke.js`.
- `tests/bench/`: `ring-bench.mjs` (ring vs modulo remap), `fence-bench.mjs` (fenced vs bare
  single-row UPDATE), `suggest-bench.mjs` (cache vs indexed catalog), `id-bench.mjs` (new: single +
  4-thread Snowflake).
- All k6 v2.2.0; the committed JSON summaries + exit codes are the record (the terminal ✗ glyph of
  v2.2.0 on clean runs is a known display quirk, documented in the method).

### 6.6 CI / guard scripts

| Guard | Command | What it protects |
|---|---|---|
| Direct pool access ban | `bash scripts/check-direct-pool-access.sh` | All shard writes go through the fenced `ShardRouter` (documented worker exception) |
| Migration ownership | `node scripts/check-shard-owned-tables.mjs` | No `bucket_id` table can exist in migrations without a manifest declaration |
| Full CI | `npm run ci` | typecheck (5 workspaces) → lint → both guards → all workspace tests |

---

## 7. Evaluation results — what was actually measured

Method (`docs/experiments/00-method.md`): k6 v2.2.0 on the same laptop as the stack (comparative
numbers only); each workload × 3 warmed runs; **p95/p99 reported per run + median [range], never
averaged**; rate limiting bypassed only for throughput runs (`RATE_LIMIT_BYPASS_IPS` is test-only
and inert in production); `docker stats` sampled; every raw is committed.

### 7.1 Workloads (all-targets green: 0 % failed everywhere)

| Profile | p95 median [range] | p99 median [range] | Throughput |
|---|---|---|---|
| Low (10 rps) | 71 [49–75] ms | 122 [92–707] ms | 1 530 reqs / 3 m ≈ 8.5 req/s |
| Medium (30 rps) | 117 [27–120] ms | 140 [123–143] ms | 6 330 reqs / 4 m ≈ 26.4 req/s |
| High (60 rps) | 41 [29–71] ms | 124 [97–135] ms | 19 830 reqs / 6 m ≈ 55.1 req/s |
| 9 AM check-in burst | (see `evaluation.md`) | (see `evaluation.md`) | failed **0 %**, check-in thresholds cleared |

Project targets (thresholds the scripts enforce): overall p95 < 2 000 ms / p99 < 4 000 ms; burst
failed < 15 %, check-in p95 < 3 000 / p99 < 6 000 ms — **all clear**.

### 7.2 Component comparisons (fair baselines)

| Comparison | Headline |
|---|---|
| Ring vs modulo (20 k keys, add a node) | **24.9 % vs 74.4 % remap**, same keys |
| Autocomplete cache vs indexed catalog | ≈25 ms p50 both legs that day — measured catalog-vs-catalog; reported honestly as inconclusive for the cache leg |
| Fenced vs bare write | median overhead **24.2 % [−3.9–37.6 %]** across 3 files × 3 internal runs — within noise at this scale; one negative reading kept |
| Rate limiter under 40/s bad logins | **98.0–98.7 % rejected**, only 401/429 observed, latency flat |
| Snowflake IDs | **≈2.9 M IDs/s** single-worker; 0 duplicates over 800 k IDs across concurrency and runs |

### 7.3 Failure & scalability scenarios (A–K)

| Scenario | Raw | Outcome |
|---|---|---|
| B + K — live shard-add | `scenario-K.txt` | COMPLETED, run `105573391162945536`: 64 buckets, 8 801 rows, checksums, counts equal; caught + fixed the snapshot-staleness 404 |
| C — 3 replicas via NGINX | `scenario-C.txt` | 6/6 round-robin probes (`x-api-instance`); medium profile sustained |
| D — API kill mid-load | `scenario-D.txt` | 0 of 6 330 failed; dead peer ejected after max_fails=2, rejoined after 10 s; all-dead → 502 in ~7–10 ms |
| E — worker kill, payroll | `scenario-E.txt` | Honest partial while dead; restart → COMPLETED 906 = 128 + 778; 0 duplicate rows |
| F — Redis queue + KV outage | `scenario-F.txt` | Fail-closed 503 ≤ 2.1 s; fail-open keep 200; bounded queue errors; 0 phantom keys |
| I — shard-2 outage | `scenario-I.txt` | Writes 503 @ 0.03 s; scatter reads 200 with `meta.partial`; idempotent recovery |
| J — catalog outage | `scenario-J.txt` | Writes live to 19.2 s, first `GATE_CLOSED` @ 20.86 s; login/search 503 ~2.0 s; recovery 4.03 s after Postgres ready; worker survives |
| G — 9 AM burst | `burst-r{1,2,3}.txt` | Same raw as the burst workload row (no separate rerun, documented) |

---

## 8. How everything was verified (and how to re-verify)

**Final gate commands** (all passed at HEAD `d8f3652`; the API suite needs the stack up and env
sourced per README):

```bash
source api-env.sh && MAIL_LIVE=1 npm run ci        # typecheck + lint + guards + all workspace tests
npm --workspace @hrms/web run build                # Next 15 production build
npm --workspace @hrms/web run e2e                  # Playwright, needs web on :3000 + API stack up
```

**Test inventory:** 24 API suites (identity, auth, password-reset, employees, employees-activity,
attendance-leave, attendance-reports, payroll, payroll-retry, recruitment, sourcing, performance,
reports, announcements, admin-users, infra, fence-coverage, catalog-gate, gate, migration,
migration-gate, seed-routing, trust-proxy, jobs-suggest) · 13 core suites (bucket, golden-vectors,
ring, map-equality, load-active-map, routing-cache, snowflake, id-issuer, leases, kv, dispatcher,
payroll math, crawler, registration) · 14 e2e flows (landing, login, invitation, employee
lifecycle, attendance, profile, leave, payroll, public hiring, sourcing, performance, admin pages,
profile menu, admin users).

**Evidence rule (strict):** every number in `docs/evaluation.md` traces to a committed raw in
`docs/experiments/raw/` — k6 JSON summaries, bench JSON, or scenario logs (with sidecar `.log`
captures where relevant). Where a measurement was inconclusive (`bench-suggest` cache leg), the
document says so instead of overclaiming.

**The §34 walk itself** (the "whole-branch review" required by the plan) is the 88-row table in
`docs/evaluation.md`, each row pointing at a test name, raw file, commit, or artifact. The walk
found the two missing items (§3.2), which were implemented, re-verified by a full CI + build + e2e
pass, and committed (`4cebfb9`, `d8f3652`).

---

## 9. Known limitations, honest caveats, and demo notes

1. **All performance numbers are comparative, single-laptop numbers** (the load generator shares the
   machine) — stated in the method and in every table.
2. **Dataset is small by design** (190 people, <1 k attendance rows): sharding benefits are
   structural (routing, migration, isolation), not throughput-visible at this scale — the PRD
   permits this once stated.
3. **Moto S3 stands in for MinIO** (the registry proxy blocked the MinIO image); the storage
   adapter is unchanged.
4. **Candidate-domain audit delivery** is best-effort via the shared dispatcher (documented).
5. **Shard removal** is preview/unit-test-only by PRD allowance; there is no drain capability, and
   no such claim is made.
6. **Phase 11 (AWS)** deferred — the PRD's optional deployment phase.
7. **Windows docker port-proxy quirks** appear in chaos runs (post-container-start reconnect
   delays of a few seconds) — recorded in scenario logs; they affected recovery *timing*
   observations only.
8. **Demo prep note:** the dev database intentionally accumulated test rows across runs (e.g., a
   stray `retrytest-*` leave row and many scenario artifacts). This is deliberate (no reset/reseed
   policy) and harmless for the demo; if a spotless dataset is wanted for a live showing, reseed
   from the seed script rather than deleting rows ad hoc.
9. **`master` vs feature branch:** all post-Phase-7 work (Phases 8–10c) lives on
   `feat/remaining-8-11-plus-premium-ui`; `master` is the Phase 7 baseline. The GitHub repo defaults
   to the feature branch so the full work is front and center.

---

## 10. Index — where everything lives

| Topic | File(s) |
|---|---|
| The 88-item acceptance walk | `docs/evaluation.md` §34 acceptance walk |
| All measured tables + failure scenarios | `docs/evaluation.md` + `docs/experiments/raw/` |
| Decision log D-001…D-020 | `docs/decisions.md` |
| Phase history | `docs/status.md` |
| API surface | `docs/api/overview.md` |
| Table ownership (employee/candidate/catalog) | `docs/shard-owned-tables.md` |
| Run instructions | `README.md` |
| Measurement method | `docs/experiments/00-method.md` |
| The closure plan (22 tasks) | `docs/superpowers/plans/2026-10-17-acceptance-gap-closure.md` |
| Operating ledger (hashes, raw runs, fixes) | `.superpowers/sdd/2026-10-17-acceptance-gap-closure/progress.md` (local) |
| CI guards | `scripts/check-direct-pool-access.sh`, `scripts/check-shard-owned-tables.mjs` |
| Load/bench scripts | `tests/load/*.js`, `tests/bench/*.mjs` |
| Migrations (21) | `infrastructure/postgres/migrations/` |
| NGINX config | `infrastructure/nginx/nginx.conf` |
| Monitoring config + dashboards | `infrastructure/monitoring/`, `infrastructure/grafana/` |

---

*Report written 2026-10-19 at HEAD `d8f3652` (branch `feat/remaining-8-11-plus-premium-ui`,
pushed to `Sanjai52/HRMS`). All verification numbers cited here were produced on this HEAD; the
commit trail after `PRD.md` (57 commits) is the audit trail for every claim in this document.*
