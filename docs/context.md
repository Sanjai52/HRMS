# Project Context — Scalable HRMS

> Orientation document for maintainers, reviewers and demo operators.
> Written 2026-10-19 at `main` @ `ebdb4b7`. Identity and decision detail live in the
> linked documents; this file is the map, not the record.

## 1. What this is

UCS3513 System Design Laboratory, Mini Project 6 (SSN College of Engineering, AY 2026–27):
a scalable full-stack HRMS prototype plus a system-design evaluation. The specification is
`PRD.md` (v2.5). Implementation phases 1a–10 are complete and verified; the optional
phase 11 (AWS deployment) is deferred by design.

- Repository: `github.com/Sanjai52/HRMS` (private) · default branch `main`
- Approach: local-first — Docker Compose for data services, three API replicas on the
  host behind NGINX, Next.js web app, BullMQ worker, candidate portal, Mailpit, Moto S3.
- Acceptance: PRD §34 walk — 88/88 items with evidence in `docs/evaluation.md`.

## 2. System at a glance

```text
Browser / k6
     |
     v
NGINX :8080   (round-robin, max_fails=2 fail_timeout=10s)
     |
     +--> API :4000 ┐
     +--> API :4002 ├─ Express modular monolith (same build, x-api-instance header)
     +--> API :4003 ┘        |
                             +--> ShardRouter — 256-bucket hash + ring (V=128)
                             |        |
                             |        +--> pg-catalog :5438 (users, directory index, routing maps,
                             |        |                    registry, outbox, audit, leases)
                             |        +--> shard-1 :5439 ┐
                             |        +--> shard-2 :5440 ├ employee & candidate data (bucket_id)
                             |        +--> shard-3 :5441 ┘
                             |        +--> shard-4 :5442   (standby; activation via audited migration only)
                             |
                             +--> redis-queue :6379 (BullMQ) · redis-kv :6380 (sessions, limiter,
                                                       autocomplete, KV, short links)

Worker (host process, metrics :4001) — dispatcher loop, payroll chunks, crawler, notifications
Web :3000 (Next.js) · Candidate portal :4100 (compose) · Mailpit :8025 · S3/Moto :5000
Observability profile: Prometheus :9090 · Grafana :3001 · exporters · cAdvisor
```

## 3. Current state (2026-10-19)

| Item | State |
|---|---|
| Phases 1a–10 | DONE — per-phase detail in `docs/status.md` |
| Phase 11 (AWS) | deferred (PRD §40; out of scope for the local demo) |
| PRD §34 walk | 88/88 items with per-item evidence in `docs/evaluation.md` |
| Last full gates | `npm run ci` exit 0 (typecheck 5/5, guards, API 24 files/73 passed, core 13/40 passed) · Playwright e2e 14/14 · k6 smoke 121/121 |
| UI acceptance walk | recorded in `docs/ui-walkthrough.md` |
| Demo credentials | `docs/secrets.md` |

## 4. Repository map

| Path | Responsibility |
|---|---|
| `apps/api` | Express modular monolith — route groups per domain, auth/RBAC, rate-limiter middleware, registry, audit, catalog gate, routes/health + /metrics |
| `apps/web` | Next.js App Router UI (Airbnb design language), Tailwind v4 tokens |
| `apps/worker` | BullMQ consumers (payroll chunks, notifications), dispatcher loop, crawler, metrics :4001 |
| `apps/candidate-portal` | Public candidate-facing pages (compose service :4100) |
| `packages/core` | Domain core — bucket hash, ring, ShardRouter, fenced writes, registry/leases, routing cache, autocomplete, KvStore, queue adapter, payroll, migration runner logic |
| `infrastructure/postgres` | Migrations `NNN_*.sql` (immutable once run) + runner + seeds |
| `infrastructure/nginx` | Ingress with three upstreams; `/metrics` blocked |
| `infrastructure/monitoring` | Prometheus scrape config + alert rules |
| `infrastructure/grafana` | Provisioned datasource + 3 dashboards (api-overview, worker-queue, shards-redis) |
| `tests/load` | k6: `smoke.js`, `mixed.js` (low·medium·high), `burst.js`, `ratelimit.js` |
| `tests/bench` | Ring, suggest, fence, ID benchmarks (raws in `docs/experiments/raw/`) |
| `scripts` | CI guards: direct-pool-access ban, shard-owned-tables ownership check |
| `docs` | Documentation set — index in §5 |

## 5. Documentation index

| Doc | What it answers |
|---|---|
| `PRD.md` | the specification (v2.5) — requirements, design, acceptance criteria, phases |
| `README.md` | quick start, compose profiles, replica recipe, verify commands |
| `docs/report.md` | post-PRD implementation report — FR matrix, the eight system-design components, infra, measured results |
| `docs/status.md` | phase-by-phase build tracker (measured only) |
| `docs/decisions.md` | D-001…D-020 — every configuration decision with rationale and file cites |
| `docs/evaluation.md` | measured results (workloads, component comparisons, failure scenarios) + the §34 acceptance walk |
| `docs/api/overview.md` | route groups, RBAC, envelopes, limiter scopes |
| `docs/shard-owned-tables.md` | canonical employee/candidate table ownership manifest (CI-checked) |
| `docs/design-system.md` | UI tokens and rules for `apps/web` |
| `docs/design.md` | the Airbnb design-language reference the tokens derive from |
| `docs/experiments/00-method.md` + `raw/` | measurement method + every committed raw run |
| `docs/superpowers/plans/` | execution plans (Phase 1a scaffold, phases 8–11, acceptance-gap closure) |
| `docs/ui-walkthrough.md` | UI acceptance walk through the live app (Playwright MCP) |
| `docs/secrets.md` | local demo logins + per-page input guide |
| `infrastructure/postgres/migrations/README.md` | migration file rules |

## 6. Core mechanisms cheat-sheet

- **Routing:** employee id → SHA-256 (lowercased) first 4 bytes big-endian mod 256 = bucket;
  ring (V=128) maps buckets → shards; the materialized, versioned map lives in the catalog
  and every process loads the same active version.
- **Consistency:** catalog write gate + shard `shard_write_gate` fences; one `fencedWrite`
  wrapper per shard mutation; audit/outbox rows commit atomically with the change; the
  dispatcher consumes idempotently by event id.
- **Outage bounds:** registration validity ≈ 20 s local deadline (heartbeat 5 s / TTL 30 s /
  margin 10 s); ID leases ≈ 45 s (renew 10 s, margin 15 s); the earlier deadline binds.
  Catalog reads fail closed; the system never guesses a shard.
- **Shard-add migration:** preview → `GATED` on all involved shards → every registered
  process acks → copy + checksum verify → smoke → switch map → reopen gates. Abort before
  copy reopens only its own-epoch markers via CAS.
- **IDs:** snowflake — 41-bit milliseconds since 2026-01-01 UTC, 10-bit worker, 12-bit
  sequence; worker ids are leased durably in the catalog.
- **Rate limiter:** shared Lua token bucket in redis-kv; scopes (login, recovery, public
  jobs, apply, suggest, search, short, crawler trigger…); per-scope fail policy
  (fail-closed for sensitive writes, fail-open for reads).
- **Autocomplete:** Redis zset prefix index (K=20, 12-char cap, TTL 7 d) for org employees
  and public jobs; never exposes private fields; catalog fallback past the cap.
- **Notifications:** outbox → dispatcher → Mailpit (local email) + in-app notification
  rows; per-employee preferences.

## 7. Running it

- Quick start: `README.md` (compose up → migrations → seeds → API/worker/web).
- Ports: web `:3000` · API `:4000` (extra replicas `:4002`/`:4003`) · NGINX `:8080` ·
  candidate portal `:4100` · Mailpit `:8025` · Prometheus `:9090` · Grafana `:3001`
  (admin/admin) · worker metrics `:4001` · S3/Moto `:5000` · Postgres `:5438–:5442` ·
  Redis `:6379`/`:6380`.
- Credentials and the per-page input guide: `docs/secrets.md`.

## 8. Known deviations / limitations

- PRD §6 IA route shapes differ in a few places (accepted, functional equivalents):
  the HR overview is the role-aware `/dashboard`; employee editing is inline on the detail
  page; leave policies render on `/hr/leave`; payroll history is the batch list on
  `/hr/payroll`; application status is `/application-status?token=…`; job apply is
  `/jobs/[slug]/apply`.
- Phase 11 (AWS) not started (deferred by design).
- Dev data accumulates by design (no resets); a stray test row (`retrytest-…`) may remain.
- Evaluation-side caveats (k6 v2 summary quirk, test-only limiter bypass used for
  throughput runs) are documented in the Limitations section of `docs/evaluation.md`.
