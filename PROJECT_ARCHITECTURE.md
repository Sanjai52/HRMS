# Scalable HRMS — Complete Project & Architecture Guide

> **One document that explains everything:** what this project is, what it does, how it is designed, how it stores and moves data, how it fails safely, what was actually measured, what is still open, and how to run and re-verify all of it.
>
> This is a **compiled, self-contained** guide derived from the repository's canonical documents (`PRD.md`, `docs/*`) **and** from reading and running the actual source, verified at commit `0dd09d2` and re-checked against newer HEADs (latest: `203f74f`).

| Field | Value |
|---|---|
| Project | Scalable Human Resource Management System (HRMS) — UCS3513 System Design Laboratory, Mini Project 6 |
| Institution / year | SSN College of Engineering, Kalavakkam — AY 2026–27 |
| Repository | `HRMS` (github.com/Sanjai52/HRMS, private) |
| Branch / HEAD analysed | `main` @ `0dd09d2` (verified 2026-10-19) · re-checked @ `203f74f` (2026-10-22) |
| Document date | 2026-10-21 |
| Commits | 69 (first: `670869b` "Phase 1a walking skeleton with Airbnb design system") |
| Tracked files | 331 |
| Backend | Node.js ≥ 22 · TypeScript (strict, `NodeNext`) · Express 4 modular monolith |
| Frontend | Next.js 15 (App Router) · React 19 · Tailwind CSS 4 · Airbnb design language |
| Data | PostgreSQL 16 — 1 catalog + 3 active shards + 1 standby · Redis 7 ×2 (queue + KV) · S3 (moto) |
| Queue | BullMQ on Redis (`hrms` queue) |
| Ingress | NGINX (local) → ALB (AWS, deferred) |
| Observability | Prometheus + Grafana + cAdvisor + exporters |
| Load testing | k6 v2.2.0 · Node micro-benchmarks |
| **Verification at time of writing** | `npm run typecheck` ✅ · `pool-access-ok` ✅ · `shard-owned-tables-ok (16/16)` ✅ · **core 13 files / 40 passed, 4 skipped** ✅ · **API 24 files / 73 passed, 1 skipped** ✅ · **web production build** ✅ · **Playwright e2e 14/14** ✅ (all run at `0dd09d2`) |

> **What changed since the verified baseline (`0dd09d2` → `203f74f`):** a premium UI revamp (dozens of `apps/web/app/**` pages restyled, new `apps/web/app/design/page.tsx` demo page, updated `apps/web/lib/*`), two small API route fixes (`applications.ts`, `leave.ts`), and Grafana dashboard JSON alignment. **No architecture change:** topology, sharding, routing protocol, security, queueing and observability remain exactly as documented. The verification results above therefore still apply at the component level this document describes.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What the Project Is](#2-what-the-project-is)
3. [What the System Does](#3-what-the-system-does)
4. [Architecture at a Glance](#4-architecture-at-a-glance)
5. [Repository and Technology Map](#5-repository-and-technology-map)
6. [Service Catalog](#6-service-catalog)
7. [The Eight System-Design Components](#7-the-eight-system-design-components)
8. [Data Architecture](#8-data-architecture)
9. [Routing and Sharding](#9-routing-and-sharding)
10. [Consistency and Failure Control](#10-consistency-and-failure-control)
11. [API Surface](#11-api-surface)
12. [Background Processing](#12-background-processing)
13. [Security](#13-security)
14. [Observability and Operations](#14-observability-and-operations)
15. [Measured Results](#15-measured-results)
16. [The Frontend](#16-the-frontend)
17. [Verification and Test Inventory](#17-verification-and-test-inventory)
18. [Build Phases and Status](#18-build-phases-and-status)
19. [Decision Log](#19-decision-log)
20. [Known Findings, Gaps and Limitations](#20-known-findings-gaps-and-limitations)
21. [Running and Re-verifying the Project](#21-running-and-re-verifying-the-project)
22. [Glossary](#22-glossary)
23. [Document Index](#23-document-index)

---

## 1. Executive Summary

This is a **complete, running, distributed HR management system** built as a system-design laboratory project. The product is real — authentication, employees, attendance, leave, payroll, recruitment, performance, notifications, reports, admin — but the *point* of the project is the machinery underneath.

**The central idea** is a deliberate separation of concerns:

- **The product** is a modular Express monolith over **real physical PostgreSQL shards**, fronted by a Next.js app and a standalone BullMQ worker.
- **The system-design demonstration** is that *the routing, the fencing, the caching, the limiting, the ID generation, the migration and the failure behaviour are all project code* — not a managed service standing in for the experiment.

The concrete architecture:

```text
Browser / k6
     |
     v
NGINX :8080  (round-robin, max_fails=2 fail_timeout=10s)
     |
     +--> API :4000 ┐
     +--> API :4002 ├─ Express modular monolith (same build, x-api-instance header)
     +--> API :4003 ┘       |
                           +--> ShardRouter — 256-bucket SHA-256 hash + 128-vnode ring
                           |       |
                           |       +--> pg-catalog :5438  (users, roles, invitations, directory
                           |       |                      projection, routing maps, registry,
                           |       |                      leases, jobs, short URLs, audit, …)
                           |       +--> shard-1 :5439 ┐
                           |       +--> shard-2 :5440 ├─ employee- and candidate-owned data
                           |       +--> shard-3 :5441 ┘  (every row carries bucket_id)
                           |       +--> shard-4 :5442   (standby; activated only by an audited migration)
                           |
                           +--> redis-queue :6379 (BullMQ)  ·  redis-kv :6380 (sessions, limiter,
                                                                 autocomplete, KV, short links)

Worker (host process, metrics :4001) — outbox dispatcher loop, payroll chunks, crawler, notifications
Web :3000 (Next.js)  ·  Candidate portal :4100 (compose)  ·  Mailpit :8025  ·  S3/Moto :5000
Observability profile: Prometheus :9090 · Grafana :3001 · exporters · cAdvisor
```

**What makes it interesting technically:**

1. **A real shard-add migration ran live.** Run `105573391162945536` moved **64 buckets / 8,801 rows** from shards 1–3 onto the standby `shard-4`, with per-table checksums, count equality, a read-only smoke test under closed gates, and a same-epoch cutover. It is not a simulation.
2. **Write exclusion is enforced by a fence, not by polling.** Every authoritative shard write acquires a transaction-scoped advisory lock and checks a durable `shard_write_gate` marker *in the same transaction*. A stale writer physically cannot commit after cutover.
3. **Failure is bounded, not hoped for.** A catalog outage stops shard writes at a locally-computed monotonic deadline (**~20 s**, observed 20.86 s), not "eventually". A Redis outage fails closed or open *per endpoint scope*, decided in configuration.
4. **The rate limiter is shared and atomic.** A single Redis Lua token bucket means all three API replicas count against the same bucket; measured 98.0–98.7 % rejection under a 40 req/s bad-login flood with flat latency.
5. **The evaluation is honest.** Every number in `docs/evaluation.md` traces to a committed raw artifact in `docs/experiments/raw/` (74 files). Where a measurement was inconclusive — the autocomplete cache leg — the document says so rather than overclaiming.

**Status:** Phases 1a–10c are complete and verified. Phase 11 (AWS deployment) is deferred by design (PRD §40 marks it optional). The PRD §34 acceptance walk covers **88/88 items** with per-item evidence.

---

## 2. What the Project Is

### 2.1 The assignment

> Design and develop a prototype of a scalable Human Resource Management System supporting employee registration and authentication, employee profile management, attendance tracking, leave management, payroll processing, recruitment, and performance management. […] The following system-design components are available for incorporation: Rate Limiter, Sharding, Consistent Hashing, Key-Value Store, Unique ID Generator, URL Shortener, Web Crawler, and Autocomplete. The mapping between these components and the HR functionalities is not provided. Students must analyse the requirements and determine which component(s) are appropriate for each functionality.

The statement demands the mapping be *justified*, requires quantitative evaluation at **at least three workload levels**, comparison against simple baselines, and **at least one scalability or failure scenario**. All of that is present and measured.

### 2.2 The six official deliverables

| # | Deliverable | Where it is answered |
|---|---|---|
| 1 | Requirement analysis & component mapping | `PRD.md` §7–§8, §9; this document §3, §7 |
| 2 | System architecture & design | `PRD.md` §9, §26–§28; this document §4–§12 |
| 3 | Working prototype | `apps/*`, `packages/core`, `infrastructure/*` — running, tested |
| 4 | Performance evaluation | `docs/evaluation.md` + `docs/experiments/raw/` (74 artifacts); §15 below |
| 5 | Scalability & failure analysis | `docs/evaluation.md` §"Failure scenarios" (B–K); §15.3 below |
| 6 | Report & demonstration | `docs/report.md` (post-PRD implementation report), `docs/ui-walkthrough.md` (live UI walkthrough) |

### 2.3 Explicit non-goals

Real payment integration · real banking/tax filing · scraping LinkedIn or any site that forbids it · biometric hardware · full ERP/accounting · mobile-native apps · Kubernetes · Kafka event streaming · a microservice per HR domain · multi-region DR · certified privacy compliance. A full Saga orchestrator and production distributed locks are explicitly out of scope; candidate→employee conversion uses an idempotent state machine instead.

### 2.4 Priority tiers (PRD §8.1)

- **P0** — product + foundations: auth/RBAC, employee lifecycle, search, attendance, leave, payroll, recruitment, performance, notifications, admin, sharding, IDs, rate limiting, KV, autocomplete, migrations, observability, tests.
- **P1** — required system-design demonstration: verified shard-add migration, URL shortener, crawler, async workers, outbox-driven indexing, NGINX replicas, k6 workloads, failure/scalability experiments.
- **P2** — deployment and polish: AWS, advanced reports, optional Firecrawl provider, expanded dashboards. *"P2 must not delay a complete local demonstration."*

---

## 3. What the System Does

### 3.1 Roles

| Role | Capabilities |
|---|---|
| **Employee** | Check in/out, apply/cancel leave, view own profile, payslips, performance, notifications; search the directory |
| **Manager** | Team view, approve/reject direct reports' leave, write performance reviews and goals |
| **HR** | Full employee management, attendance corrections, leave policies and override, payroll structures and batch runs, jobs, candidates, applications, sourcing, review cycles, announcements, reports, settings |
| **Admin** | Everything HR can do, plus users & roles, audit log, system health, shard control plane |
| **Public visitor** | Job board, job detail, apply with a resume, application status via a one-time token, short-link redirects |

### 3.2 Functional requirements and where they live

| FR | Feature | Implementation | Test coverage |
|---|---|---|---|
| FR-01 | Invitation lifecycle | `apps/api/src/routes/auth.ts` | `identity.test.ts`, `fence-coverage.test.ts`, e2e #3 |
| FR-02 | Authentication / session | `auth.ts`, `auth/sessions.ts`, `auth/token.ts` | `auth.test.ts`, `identity.test.ts`, e2e #2 |
| FR-03 | Authorization (RBAC) | `middleware/auth.ts` → `requireAuth`, `requireRoles` | `identity.test.ts` denials, `admin-users.test.ts`, e2e #14 |
| FR-04 | Employee profiles | `routes/employees.ts` (`/me`, `/team`, `/:id`, `/:id/activity`) | `employees.test.ts`, `employees-activity.test.ts`, e2e #4, #6 |
| FR-05 | Search & autocomplete | `routes/search.ts` (org), `routes/jobs.ts` (public jobs) | `jobs-suggest.test.ts`, `bench-suggest-r*` |
| FR-06 | Attendance | `routes/attendance.ts` | `attendance-leave.test.ts`, `attendance-reports.test.ts`, e2e #5 |
| FR-07 | Leave management | `routes/leave.ts` | `attendance-leave.test.ts` (7 cases), e2e #7 |
| FR-08 | Payroll | `routes/payroll.ts` + `packages/core/src/payroll-chunk.ts` | `payroll.test.ts`, `payroll-retry.test.ts`, e2e #8 |
| FR-09/10 | Recruitment & candidates | `routes/jobs.ts`, `routes/applications.ts` | `recruitment.test.ts`, e2e #9 |
| FR-11 | Candidate sourcing (crawler) | `apps/worker/src/crawl.ts` + `packages/core/src/crawler.ts` | `sourcing.test.ts`, `crawler.test.ts`, e2e #10 |
| FR-12 | Performance management | `routes/performance.ts` | `performance.test.ts`, e2e #11 |
| FR-13 | Notifications | `routes/notifications.ts` + dispatcher fan-out | `announcements.test.ts`, Mailpit round-trip (`infra.test.ts`) |

### 3.3 Component-to-feature mapping

| Component | Where it earns its place | Evidence |
|---|---|---|
| **Rate limiter** | Login, invitation accept, password recovery, public job board, applications, short-link redirects, search, autocomplete, crawler trigger | `ratelimit-r{1,2,3}.txt` — 98.0–98.7 % rejection, 401/429 only |
| **Sharding (ShardRouter)** | Every employee- and candidate-owned table; 16 shard-owned tables, 10 employee + 6 candidate | `seed-routing.test.ts`, live shard-4 migration |
| **Consistent hashing** | Bucket → physical shard placement on a 128-vnode ring; not HTTP load balancing | `bench-ring-r{1,2,3}.txt` — 24.9 % vs 74.4 % remap |
| **Key-value store** | Sessions + refresh state, rate-limit buckets, autocomplete prefix index, short-link cache | `kv.test.ts`, scenario F (KV-loss policy) |
| **Unique ID generator** | Employee, attendance, leave, payroll, candidate, job, application, outbox-event, audit, migration-run IDs | `bench-id-r{1,2,3}.txt` — ≈2.9 M IDs/s, 0 duplicates |
| **URL shortener** | Public job links and application links | `recruitment.test.ts` — allow-list, redirect, collision retry |
| **Web crawler** | Sourcing candidates from the project-owned simulated portal | `sourcing.test.ts` — re-run imports zero duplicates |
| **Autocomplete** | Org directory (HR/Admin/Manager) and the public job board | `bench-suggest-r*` (with an honest caveat), `jobs-suggest.test.ts` |

---

## 4. Architecture at a Glance

### 4.1 Topology

```text
                              ┌───────────────────────────────┐
   Browser  ──HTTPS──►  NGINX :8080                          │  round-robin over 3 API
   k6       ──HTTP───►  (proxy_set_header X-Forwarded-For)  │  replicas, max_fails=2
                              └──────────────┬───────────────┘  /metrics → 403
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              ▼                              ▼                              ▼
        API :4000                       API :4002                       API :4003
        (tsx dev / node dist)           (identical build)               (identical build)
              │                              │                              │
              │  Express 4 modular monolith — 16 route modules            │
              │  + middleware: metrics · cors · cookies · json            │
              │  + registry heartbeat (5 s) → pg-catalog                   │
              │  + RoutingCache (routing map + user→employee identity)    │
              └──────────────┬───────────────────────────────┬───────────┘
                             │                               │
              ┌──────────────▼─────────────┐   ┌───────────▼────────────────────┐
              │  pg-catalog :5438           │   │  ShardRouter (fenced writes)  │
              │  27 tables — control plane  │   │  bucket = SHA256(uuid)%256    │
              └─────────────────────────────┘   └───────────┬────────────────────┘
                                                             │
                    ┌──────────────┬──────────────┬──────────┴─────────┐
                    ▼              ▼              ▼                    ▼
              shard-1 :5439  shard-2 :5440  shard-3 :5441      shard-4 :5442
              (44 employees) (43)           (47)                (standby, 0)
                    └──────────────┴──────────────┴────────────────────┘
                                    18 tables each, every row carries bucket_id

              redis-queue :6379 (BullMQ)      redis-kv :6380 (256 MB, noeviction)
              s3/moto :5000 (resumes)        mailpit :1025/:8025 (email)
              candidate-portal :4100 (simulated external portal the crawler reads)
```

### 4.2 The three planes

| Plane | Contents | Behaviour on failure |
|---|---|---|
| **Data plane** | API replicas, worker, shard databases, Redis KV, queue | Serves shard-local traffic from the last routing snapshot until a locally-computed deadline expires |
| **Control plane** | `pg-catalog`: routing maps, process registry, worker-ID leases, catalog write gate, user directory, jobs, short URLs | Its loss is **bounded and explicit** (~20 s), never silent and never guessed |
| **Observability plane** | Prometheus, Grafana, exporters, cAdvisor, `docs/experiments/raw/` | Never on the request path; `/metrics` is blocked at the ingress and gated by raw socket peer in the API |

### 4.3 Data placement rule (the one thing to remember)

> **Employee- and candidate-owned data lives on a physical shard, chosen by a 256-bucket hash and a versioned consistent-hash ring. Everything else — identity, directory projection, jobs, config, control state — lives in `pg-catalog`.**

`pg-catalog` is *not* a business shard. It is the control plane, and it is included in Compose, migrations, connection budgets and failure tests.

---

## 5. Repository and Technology Map

### 5.1 Layout

```text
hrms/
├── apps/
│   ├── api/                 Express modular monolith — 16 route modules (port 4000)
│   ├── web/                 Next.js 15 App Router UI, 50 routes (port 3000)
│   ├── worker/              BullMQ consumers, dispatcher loop, crawler, payroll chunks (metrics 4001)
│   └── candidate-portal/    Simulated external candidate portal (compose :4100)
├── packages/core/           @hrms/core — the shared domain core (1,869 LOC of source)
├── infrastructure/
│   ├── postgres/            20 migrations + runner + 2 seed scripts
│   ├── nginx/               Ingress with 3 upstreams; /metrics → 403
│   ├── monitoring/          Prometheus scrape config + alert rules
│   └── grafana/             Provisioned datasource + 3 dashboards
├── tests/
│   ├── load/                k6: smoke.js, mixed.js, burst.js, ratelimit.js
│   └── bench/               ring-bench, suggest-bench, fence-bench, id-bench
├── scripts/                 CI guards: direct-pool-access ban, shard-owned-tables check
├── docs/                    PRD, decisions, status, evaluation, report, context, walkthroughs, raws
├── PRD.md                   The specification (v2.5, 2,743 lines)
├── docker-compose.yml       Core stack + observability profile
└── package.json             npm workspaces (apps/*, packages/*)
```

### 5.2 Technology stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript 5, `strict: true`, `module: NodeNext` | `tsconfig.base.json` |
| Runtime | Node.js ≥ 22 (`engines.node`) | Verified here on Node 26 |
| HTTP | Express 4.21 | A local `Layer.prototype.handle_request` shim forwards async rejections to the error handler (express-async-errors equivalent, kept dependency-free) |
| DB driver | `pg` 8.23 | Explicit pools, per-pool timeouts, idle-client error guard |
| Queue | BullMQ 6 on ioredis | Producer is fail-fast bounded; consumers retry unbounded |
| Cache/KV | Redis 7 via ioredis, behind a `KvStore` interface | `redis-kv` is `noeviction`, 256 MB, alert at 80 % |
| Auth | Argon2id + JWT (10-min access) + rotating refresh cookie + double-submit CSRF | |
| Object storage | S3 API via `minio` client; moto server locally | Adapter unchanged between moto and MinIO |
| Email | nodemailer → Mailpit locally; adapter interface for a cloud provider | |
| Frontend | Next.js 15, React 19, Tailwind 4, Phosphor icons, Airbnb design language | |
| Observability | prom-client → Prometheus → Grafana (+ cAdvisor, postgres/redis exporters) | |
| Load / bench | k6 v2.2.0, Node micro-benchmarks | |
| CI | `npm run ci` = typecheck → lint → 2 guards → workspace tests | |

### 5.3 Code size (tracked source, excluding `node_modules`/`.next`)

| Path | Lines |
|---|---|
| `apps/api` | 8,372 |
| `apps/web` | 6,592 |
| `packages/core` | 3,176 (1,869 src + tests) |
| `infrastructure` | 846 |
| `tests` (load + bench) | 465 |
| `apps/worker` | 439 |
| `apps/candidate-portal` | 93 |

### 5.4 Connection budget

| Pool | Size | Where |
|---|---|---|
| catalog | 10 | API (`apps/api/src/db/pools.ts`) |
| shard-1/2/3 | 10 each | API |
| shard-4 | 5 | API (standby) |
| catalog | 5 | Worker (`apps/worker/src/pools.ts`) |
| shard-1/2/3 | 5 each | Worker |
| shard-4 | 2 | Worker |

Every API pool carries `connectionTimeoutMillis: 2000`, `query_timeout: 5000`, `idleTimeoutMillis: 10000`, so a hung shard cannot exhaust the pool. Every pool is wrapped by `guardPool`, which logs idle-client errors instead of letting `pg`'s EventEmitter crash the process (a bug found live in scenario J).

---

## 6. Service Catalog

### 6.1 `apps/web` — the product UI

- Next.js 15 App Router, 50 route files, React 19, Tailwind 4.
- Airbnb design language: white canvas, Rausch `#ff385c` accent, Cereal/Inter type, one shadow tier, pill search bar, 8 px spacing base.
- Talks to the API through `apps/web/lib/api.ts` (`credentials: include`, CSRF header from `sessionStorage`, friendly 401/429 messages).
- Role-aware sidebar (`components/app-shell.tsx`) — hide-only, never the security boundary.
- `NEXT_PUBLIC_API_BASE` env (default `http://localhost:4000`).

### 6.2 `apps/api` — the modular monolith

16 route modules (98 endpoints) mounted under `/api/v1`:

```text
auth  employees  attendance  leave  payroll  jobs  recruitment
reports  performance  notifications  search  admin  sourcing
short-urls  public /s/:code  system/test/*  health  metrics
```

Cross-cutting pieces:

| File | Responsibility |
|---|---|
| `index.ts` | App wiring, CORS, trust proxy, request-id + `x-api-instance` headers, dependency→503 mapping, async-error shim, error boundary |
| `middleware/auth.ts` | `requireAuth` (Bearer JWT), `requireRoles(...)` |
| `middleware/rate-limit.ts` | 9 scopes, per-scope fail-open/closed, Prometheus counters, test-only bypass |
| `registry.ts` | Process registration + 5 s heartbeat + local monotonic write deadline |
| `routing-cache.ts` | Process-wide routing-map + identity snapshot, refreshed on each heartbeat |
| `fenced.ts` | The single shard-write wrapper: deadline check → fenced transaction |
| `catalog-gate.ts` | Catalog write-gate check inside the same transaction |
| `db/pools.ts` / `db/shards.ts` / `db/redis.ts` | Pool factory, owned-shard helpers, `KvStore` + raw Redis client |
| `ids.ts` | `IdIssuer` bootstrap and `nextEventId()` |
| `migration/runner.ts` | The full shard-add migration state machine |
| `audit/audit.ts` | Audit-row writer used inside transactions |
| `trust-proxy.ts` | Strict `TRUST_PROXY` parser — IPv4/IPv6/CIDR/hop count; anything else throws at boot |

### 6.3 `apps/worker` — background processing

- BullMQ `Worker` on the `hrms` queue, plus an HTTP metrics server on `:4001`.
- Job types: `payroll-chunk`, `notification`, `crawler-run`, `announcement-fanout`, `test-job`.
- Own outbox **dispatcher loop** (2 s) that drains shard outboxes and projects them into the catalog.
- Its own process registration + heartbeat + local write deadline.
- `guardPool` on every pool.

### 6.4 `apps/candidate-portal` — the simulated external site

A 93-line Express fixture serving deterministic "external" candidate profiles with **intentional imperfections**: pagination, a duplicate email, a missing email, an invalid email, empty skills, malformed HTML, a slow page, a 404 page and a 500 page. The crawler must survive all of them.

### 6.5 `packages/core` — `@hrms/core`

The shared, framework-free domain core. 21 modules plus a barrel file, exported through `index.ts`:

```text
bucket.ts          ring.ts           shard-router.ts    routing-cache.ts
migration.ts       snowflake.ts      leases.ts          registration.ts
rate-limit.ts      kv.ts             queue.ts           bullmq-queue.ts
dispatcher.ts      autocomplete.ts   crawler.ts         payroll.ts
payroll-chunk.ts   leave-rules.ts    recruitment.ts     errors.ts     providers.ts
```

---

## 7. The Eight System-Design Components

### 7.1 Rate limiter — Redis Lua token bucket

**Where it runs:** `packages/core/src/rate-limit.ts` (algorithm) + `apps/api/src/middleware/rate-limit.ts` (policy).

**Algorithm** — a single atomic Lua script, so all API replicas count against the same bucket:

```lua
local data   = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1]); local ts = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now_ms
else tokens = math.min(capacity, tokens + (now_ms - ts) * refill_per_ms); ts = now_ms end
if tokens >= 1 then tokens = tokens - 1; allowed = 1
else retry_after = math.ceil((1 - tokens) / refill_per_ms) end
redis.call('HMSET', key, 'tokens', tokens, 'ts', ts)
redis.call('PEXPIRE', key, windowMs * 2)
```

**Scopes and outage policy (D-019):**

| Scope | Capacity / window | On limiter outage |
|---|---|---|
| `login` | 30 / 60 s | **fail closed** → 503 `LIMITER_UNAVAILABLE` |
| `accept` | 10 / 60 s | fail closed |
| `recover` | 10 / 60 s | fail closed |
| `apply` | 10 / 60 s | fail closed |
| `short` | 60 / 60 s | fail closed |
| `search` | 60 / 60 s | fail open |
| `suggest` | 120 / 60 s | fail open |
| `jobs` | 60 / 60 s | fail open |
| `crawl` | 6 / 60 s | fail open |

**Identity** = user id when authenticated, else the client IP resolved through the **narrow, validated trust proxy** (default `172.16.0.0/12`, the Docker bridge). `RATE_LIMIT_BYPASS_IPS` is honoured **only** when `APP_ENV != production`, and the process warns loudly if it is set in production.

**Measured:** 40 bad-credential logins/s × 60 s → **98.0 / 98.6 / 98.7 %** rejected of ~2,400 requests; only 401/429 observed; login p50 3 ms / p95 5 ms. Scenario F proved the outage policy: closed scopes 503 within ≤ 2.1 s, open scopes keep 200.

---

### 7.2 Sharding — `ShardRouter` over physical PostgreSQL

**Where it runs:** `packages/core/src/shard-router.ts` + `apps/api/src/db/shards.ts` + `apps/api/src/fenced.ts`.

**Bucket function** (`bucket.ts`):

```ts
BUCKET_COUNT = 256;
stableEmployeeBucket(uuid) =
  sha256(uuid.toLowerCase()).readUInt32BE(0) % 256;
```

**Ring** (`ring.ts`): 128 virtual nodes per shard (D-001); virtual node *i* of shard *s* sits at `SHA256("s:i")`; bucket *b* sits at `SHA256("bucket:b")`; the owner is the first vnode clockwise.

**Materialization** (D-015): the ring's output is materialized per version into `routing_map_versions` + `routing_map_buckets` (256 rows per version). Runtime lookups use the **validated active table**, not a live recomputation — `loadActiveMap` refuses a map whose row count ≠ 256. A CI test asserts the materialized map equals the ring output for that version (`map-equality.test.ts`).

**Two routing domains:**

| Domain | Routing key | Map | Shards |
|---|---|---|---|
| `employee` | `employee_id` | active version in `routing_map_versions` | shard-1..3 active, shard-4 via migration |
| `candidate` | `candidate_id` | separate `candidate-v1` map | pinned to shard-1..3 (`CANDIDATE_SHARDS`) |

**Ownership manifest** (`docs/shard-owned-tables.md`): 16 shard-owned tables — 10 employee (employees, attendance, leave_balances, leave_requests, notifications, salary_structures, payroll_records, goals, reviews + outbox_events which is drained-not-copied) and 6 candidate (candidates, applications, application_stage_history, interviews, assessments + candidate_outbox). `scripts/check-shard-owned-tables.mjs` cross-checks the manifest against the migrations **in both directions** and runs in CI.

**The write fence** — the heart of the design:

```ts
withFencedWrite(pool, fn):
  BEGIN
  SELECT pg_advisory_xact_lock(hashtext('shard-write'))   -- transaction-scoped shared fence
  SELECT state, epoch FROM shard_write_gate WHERE id = 1   -- durable marker
  if state == 'GATED' → ROLLBACK, throw GateClosedError (503 GATE_CLOSED)
  fn(client)  → COMMIT
```

Application code **cannot** touch a shard pool directly; `scripts/check-direct-pool-access.sh` bans it outside named exceptions (API pools, worker pools, health diagnostics, seed/migration, tests/benchmarks) and runs in CI (`pool-access-ok`).

**Measured:** per-shard employee distribution 44 / 43 / 47 on shards 1–3; live migration moved 64 buckets / 8,801 rows with checksums passing; scenario I (shard-2 outage) → routed writes 503 in 0.03 s, scatter reads 200 with `meta.partial`.

---

### 7.3 Consistent hashing — versioned ring

Already described in §7.2. The ring is **data placement only**. It is deliberately *not* the HTTP load balancer (NGINX is) and *not* the crawler scheduler.

**Measured head-to-head** (20,000 keys, adding a 4th shard, same key set for both arms):

| | remap % | owners after add |
|---|---|---|
| **Consistent-hash ring** | **24.9 %** [24.8–25.4] | 5,830 / 4,221 / 4,952 / 4,976 |
| **Modulo `hash % N`** | **74.4 %** [74.4–74.5] | — |

Bucket remapping and physical rows moved are reported as **separate** metrics, exactly as the PRD demands.

---

### 7.4 Key-value store — `KvStore` over Redis

**Where it runs:** `packages/core/src/kv.ts` + `apps/api/src/db/redis.ts`.

The project owns a narrow interface (`get` / `set` with TTL / `del` / `takeToken`) rather than pretending to reimplement Redis. The PRD is explicit: *"the project is not reimplementing Redis; the interface, semantics, TTL/eviction/persistence trade-offs and component-specific measurements must be documented."*

**Key families in v1:**

| Family | Key shape | Lifetime | Source of truth |
|---|---|---|---|
| Session/refresh | `session:{id}`, `usersessions:{userId}` | 7 days | Auth store; logout/revocation deletes |
| Rate-limit bucket | `rl:{scope}:{identity}` | window × 2 | Redis is authoritative for the window |
| Autocomplete prefix | `autocomplete:{domain}:{scope}:{prefix}` | 7 days | Derived from catalog projections; outbox refreshes it |
| Short-link cache | `short:{code}` | 1 hour | PostgreSQL is authoritative |
| Click counter | `shortclick:{code}` | — | Increment-only |

**Two Redis instances, deliberately:** `redis-queue` (BullMQ, `noeviction`, AOF) and `redis-kv` (256 MB, `noeviction`) — so *queue loss* and *KV loss* are independent failure modes that can be tested separately.

**Memory policy:** `noeviction` means pressure surfaces as write errors rather than silent session eviction, and a Prometheus alert fires at 80 % usage for 5 minutes (`RedisKvMemoryHigh`).

**Measured:** scenario F — KV loss → fail-closed scopes 503 ≤ 2.1 s, fail-open keep 200, **no PostgreSQL corruption**, 0 phantom queue keys.

---

### 7.5 Unique ID generator — Snowflake-style

**Where it runs:** `packages/core/src/snowflake.ts` + `packages/core/src/leases.ts`.

**Layout:** 41-bit milliseconds since a custom epoch (**2026-01-01 UTC**), 10-bit worker id, 12-bit sequence → 63 bits used, serialized as a **decimal string** in JSON (never a JS `Number`).

**Durable worker-ID leases** live in `pg-catalog` (`worker_id_leases`), *separate from* the process registry:

| Parameter | Value | Source |
|---|---|---|
| Lease TTL | 60 s | D-003 |
| Renewal interval | 10 s | D-003 |
| Safety margin | 15 s | D-003 |
| **Effective local window** | **45 s** | D-017 |

**Fail-closed behaviour:** `next()` throws `LeaseExpiredError` past the window and `ClockBackwardError` if the clock moves backwards — it never silently emits a duplicate.

**Ordering of the two deadlines:** the registration deadline (~20 s) is always *earlier* than the ID-lease window (~45 s), so during a catalog outage **writes stop first**, then ID generation. This ordering is asserted in `id-issuer.test.ts` and confirmed live (first `GATE_CLOSED` 503 at 20.86 s; the ID cutoff never fired first).

**Measured:** `bench-id-r{1,2,3}.txt` — **≈2.9 M IDs/s** single-worker (200,000 IDs in ~68–72 ms); 4 concurrent threads × 50,000 → **200,000 unique, 0 duplicates** in all three runs.

---

### 7.6 URL shortener

**Where it runs:** `apps/api/src/routes/jobs.ts` (`shortRouter` + `publicRouter`).

- `POST /api/v1/short-urls` (HR/Admin) → random 7-char **Base62** code, with a unique-constraint retry loop (up to 5 attempts → 500 `CODE_COLLISION`).
- **Allow-list:** only `/jobs` and `/jobs/*` destinations. Anything else → 400. This is the open-redirect defence.
- `GET /s/:code` → 302 to `WEB_ORIGIN + destination`; code must match `^[0-9A-Za-z]{4,16}$`; unknown/inactive → 404.
- Lookup order: Redis cache → authoritative catalog row → re-cache (1 h TTL) → redirect. Click counter incremented on both paths.
- The `short` limiter scope is **fail-closed** (a redirect is cheap to protect) and is applied to the redirect route as well as creation.
- Creation writes an audit row **in the same catalog transaction** and is refused while the catalog write gate is closed.

---

### 7.7 Web crawler

**Where it runs:** `apps/worker/src/crawl.ts` (the run) + `packages/core/src/crawler.ts` (provider, parser, normalizer) + `apps/candidate-portal` (the target).

- `CrawlerProvider` interface with `HttpCrawler` as the deterministic default (8 s timeout, 1 bounded retry, concurrency 2, 10-page cap). A Firecrawl adapter is a documented optional extension — **not** required, and a cloud Firecrawl service cannot reach `localhost` anyway.
- The portal is read **over HTTP only** — the crawler never touches the portal's database.
- **Deduplication:** by normalized email when present, else a deterministic fingerprint (`noid:name|expYears|sortedSkills`). The claim is taken in `pg-catalog` (`candidate_email_claims`) with `ON CONFLICT DO NOTHING` — a **global** uniqueness check, because a uniqueness constraint on a separate shard would not be global.
- Candidates route by `candidate_id` through the separate candidate map.
- Skill filter narrows discovery; per-page outcomes are recorded in `crawl_pages`; the run ledger stores pages/discovered/imported/errors and a terminal status (`COMPLETED` / `PARTIAL_FAILED` / `FAILED`).

**Measured:** `sourcing.test.ts` — the run completes, the candidate pool grows, and **re-running the same crawl imports zero new records** (NFR-CRAWL-01).

---

### 7.8 Autocomplete

**Where it runs:** `packages/core/src/autocomplete.ts` (key/member/prefix rules) + `packages/core/src/dispatcher.ts` (indexing) + `apps/api/src/routes/search.ts` and `routes/jobs.ts` (reads).

**Rules (D-009):** `K = 20` newest, prefix capped at **12 characters**, TTL **7 days**, ranking = **recency** (`score = Date.now()`, read with `zrevrange`, trimmed with `zremrangebyrank`). A caller-supplied `limit` is clamped to K.

**Two key spaces, one rule set:**

| Key space | Written by | Read by | Fallback |
|---|---|---|---|
| `autocomplete:org:all:<prefix>` | Outbox dispatcher (idempotent, version-guarded) | `GET /api/v1/search/suggest` (HR/Admin/Manager) | Indexed catalog `ILIKE` query |
| `autocomplete:jobs:public:<prefix>` | Synchronously on job create/close (catalog-owned, best-effort) | `GET /api/v1/jobs/suggest` (public) | Indexed catalog query |

**Privacy:** candidate and private data never enter either key space — asserted adversarially in `jobs-suggest.test.ts`. Deactivating an employee removes their suggestions; the admin "rebuild directory" action repairs a deliberately lost projection.

**Measured (with an honest caveat):** `bench-suggest-r{1,2,3}.txt` reported p50 ≈ 25 ms on **both** legs because in that stack state the prefix cache never served — the measured delta is catalog-vs-catalog. The document says exactly that instead of overclaiming.

---

## 8. Data Architecture

### 8.1 Two database roles

| | `pg-catalog` (port 5438) | Shards (5439–5442) |
|---|---|---|
| Role | Control plane + global projections | Business records |
| Tables | **27** | **18** each |
| Contents | users, user_roles, invitations, password_resets, employee_directory, departments, designations, leave_policies, holidays, review_cycles, jobs, short_urls, app_status_tokens, application_index, candidate_email_claims, crawl_runs, crawl_pages, announcements, notification_prefs, payroll_batches, payroll_batch_shards, routing_map_versions, routing_map_buckets, process_registry, worker_id_leases, catalog_write_gate, migration_runs, audit_logs, schema_migrations | employees, attendance, leave_balances, leave_requests, notifications, salary_structures, payroll_records, goals, reviews, outbox_events, candidates, applications, application_stage_history, interviews, assessments, candidate_outbox, shard_write_gate, schema_migrations |
| Contains authoritative employee data? | **No** — only the directory *projection* | **Yes** |

### 8.2 Migrations

- 20 files, `NNN_descriptive_name.sql`, one global increasing sequence across catalog and shard scopes.
- The runner (`infrastructure/postgres/runner.mjs`) applies `*catalog*.sql` to the catalog and `*shard*.sql` to every shard, in filename order, each in its own transaction, recording the version in `schema_migrations`. Reruns are idempotent.
- **Immutable once executed** — any change, however small, is a new `NNN` file. This is a review rule, not a tool.

### 8.3 Seeds

| Script | Purpose | Output |
|---|---|---|
| `seed.cjs` | Departments, designations, the HR user (Argon2id), 5 directory people placed through the canonical router, the **candidate** routing map | `seed-complete` |
| `seed-demo.cjs` | 60 people with salary structures, attendance history, leave, goals, reviews, jobs, applications, review cycle, candidates | `seed-demo-complete: 60 people, attendance, leave, goals, reviews, jobs, applications` |

The seed computes `bucket_id` with the same canonical SHA-256 function and resolves the physical shard through the **active materialized map** — never by hard-coding a shard. `seed-routing.test.ts` re-derives every bucket and compares it with the persisted value, checks fixed golden-vector UUIDs, and asserts the physical placement matches the active map.

### 8.4 Measured dataset (after the demo seed, verified live)

| Store | Rows |
|---|---|
| `pg-catalog.users` | 105 |
| `pg-catalog.employee_directory` | 128 |
| `pg-catalog.jobs` | 19 |
| `pg-catalog.routing_map_buckets` | 1,024 (4 map versions × 256) |
| shard-1 employees | 44 |
| shard-2 employees | 43 |
| shard-3 employees | 47 |
| shard-4 employees | 0 (standby) |

The evaluation dataset documented in the method notes is **190 people, ~826 attendance rows, 24 salary structures, 8 demo candidates**.

### 8.5 Money, dates and identifiers

- **Money is integer paise** — no floats anywhere in payroll. `computePay` applies gross → daily → LOP → PF → tax → net with explicit rounding.
- **Percentages** are 0–100 integers; the demo seed uses PF 12 %, tax 10 % (D-016).
- **Org timezone is Asia/Kolkata**; the work day is derived in that zone (`leave-rules.ts`), late threshold 09:30.
- **Employee identity is a UUID** (stable, human-independent). **Display numbers** (`EMP-000123`) are presentation only and never affect shard placement.
- **Operational IDs are Snowflake strings** (outbox events, applications, interviews, batches, crawl runs, migrations).

---

## 9. Routing and Sharding

### 9.1 The full path from a UUID to a physical row

```text
employee_id (uuid)
   │  sha256(lowercased) → first 4 bytes big-endian
   ▼
bucket_id ∈ [0,256)
   │  RoutingCache.activeMap  (snapshot of the active routing-map version)
   ▼
shard_id ("shard-2")
   │  poolFor(shard) → pg Pool
   ▼
SELECT … FROM employees WHERE employee_id = $1
```

### 9.2 The routing cache and why it exists

`RoutingCache` holds two in-process maps: the **active routing map** and the **user→employee identity** map. Both are refreshed by the **same 5 s heartbeat** that keeps the process registered.

This exists so that **no ordinary business write performs a synchronous `pg-catalog` query**. That is the property that lets shard-local writes continue during a catalog outage — bounded only by the local deadline, not by catalog availability.

**Miss-refresh (a bug found and fixed during scenario K):** onboarding followed immediately by a self-service action 404'd for up to one heartbeat, because the identity snapshot predated the new directory row. The fix is a **single-flight miss re-read** in `RoutingCache.employeeIdOf`: a miss always re-reads, concurrent misses share one in-flight load, and a miss *during a catalog outage* fails closed rather than guessing. After the fix, onboarding → first action returns 201 in ~0.06 s.

### 9.3 Shard-add migration — the verified protocol

This is the centrepiece experiment. Full state machine:

```text
PREVIEWED → PREPARING → GATED → COPYING → VERIFYING → VERIFIED_GATED
          → CUTOVER_COMMITTED → ACKED → WRITES_RESUMED → COMPLETED
   (+ ABORTED / FAILED paths)
```

| Step | What happens |
|---|---|
| 1. Preview | Compute the candidate ring, the moved buckets, source/destination shards, estimated rows. Active map unchanged. Admin-only, audited. |
| 2. Prepare | Verify destination schema version + connectivity; validate the ownership manifest; drain outbox; refuse to start a second migration. |
| 3. Gate | Set the durable `catalog_write_gate` = `GATED` **and** every involved shard's `shard_write_gate` = `GATED` for one epoch. |
| 4. Drain | Acquire exclusive advisory fences on all involved shards in deterministic order; wait for in-flight writes to finish. |
| 5. Ack | Every unexpired registered process must acknowledge the gate epoch (35 s timeout). |
| 6. Copy | Copy every table in `MIGRATION_MANIFEST` for the moved buckets, idempotent upserts, 200-row chunks. Outboxes are drained beforehand and never copied. |
| 7. Verify | Per-table row count **and** an MD5 checksum over the manifest's declared columns, source vs destination. Any mismatch aborts the cutover. |
| 8. Cutover | Atomically flip the active routing-map version (256 rows must be materialized). |
| 9. Ack map | Every unexpired process must load and acknowledge the new version. |
| 10. Smoke | Read-only verification against the destination while gates are still closed. **On failure → revert the map with a same-epoch CAS and reopen gates.** |
| 11. Resume | Reopen shard gates, then the catalog gate. The first accepted post-resume write is the point of no return for a simple rollback. |
| 12. Complete | Record copy/verify/gate/cutover/resume metrics; audit the completion. |

**Safety properties, each tested:**

- A **stale writer** (paused after its first gate check) cannot commit after cutover — the fence + durable marker enforce it, not polling.
- An **abort before copy** reopens **only its own epoch's** markers via CAS. A different epoch's marker is never reopened.
- A **post-copy failure** keeps gates closed for explicit recovery. A catalog outage never auto-reopens a gate.
- Only `shard-4` may be added (`ALLOWED_NEW_SHARDS`), and only if it is actually provisioned — so a client cannot inject an arbitrary endpoint (SSRF defence).

**Live result (run `105573391162945536`, 2026-10-19):** 64 buckets moved, 8,801 rows copied, checksums passed, directory counts equal, gates reopened, state `COMPLETED`. This run also *found and fixed* the snapshot-staleness 404.

**Explicitly not claimed:** shard *removal* has no data-drain capability in v1 (PRD allows preview/unit-test only). The project does not claim zero-downtime rebalancing — the protocol deliberately pauses all state-changing writes.

---

## 10. Consistency and Failure Control

### 10.1 The consistency model

| Data class | Consistency |
|---|---|
| Employee changes, attendance, leave balances/decisions, payroll records | **Strong**, inside the owning shard transaction |
| Audit + outbox events for those mutations | **Atomic with the mutation** (same transaction) |
| Directory projection, autocomplete index, notifications, aggregate dashboards | **Eventually consistent**, version-guarded, idempotent, rebuildable |
| Cross-database operations | Idempotency + outbox/reconciliation + explicit status — *not* distributed ACID |

### 10.2 The transactional outbox and the dispatcher

- Every shard-local mutation that matters writes an `outbox_events` row (with `bucket_id`) **in the same transaction**. The candidate domain has its own `candidate_outbox`.
- `runDispatcherOnce` drains them with `SELECT … FOR UPDATE SKIP LOCKED`, **idempotently by event id**, and with a **version guard** so an out-of-order event cannot overwrite newer state.
- Failures increment `attempts` and store `last_error`; after 10 attempts the row stays visible as a dead-letter. The admin **rebuild-directory** action repairs a deliberately lost projection.
- The dispatcher also drives the autocomplete index and the `LEAVE_DECIDED` / `REVIEW_RELEASED` projections.
- A real bug found on the way: numeric Snowflake ids used directly as BullMQ job ids are rejected by BullMQ (*"Custom Id cannot be integers"*). Fixed by prefixing (`notify-${event_id}`), with 35 parked rows re-armed and proven against Mailpit.

### 10.3 Audit atomicity

- **Shard-local** business mutations commit their `AUDIT` outbox event in the same transaction as the change — a failed transaction leaves neither.
- **Catalog-owned** control-plane mutations write their audit row in the *same catalog transaction*, and **refuse to commit** when the catalog write gate is closed (`catalog-gate.test.ts`).
- The central audit projection is idempotent and asynchronous.

### 10.4 The process registry and the local write deadline

`pg-catalog.process_registry` records `process_id`, `kind` (API / WORKER), `owner`, `heartbeat_at`, `expires_at`, `map_version_loaded`, `gate_epoch_ack`, `gate_epoch`, `gate_state`.

Each process heartbeats every **5 s** (D-002). Crucially, the deadline is computed **locally from a monotonic clock**, anchored at the heartbeat *request send time*:

```ts
registrationValid(lastSentMonoMs, nowMonoMs, ttlMs = 30_000, marginMs = 10_000)
  → age < ttlMs - marginMs      // i.e. ~20 s
```

- A clock jump backwards → invalid (fail closed).
- A **failed** heartbeat does not extend the window — the deadline is meant to expire.
- Ordinary business writes never query the catalog to validate registration.

**Measured (scenario J):** shard-local writes stayed live to last-heartbeat + 20 s, then `GATE_CLOSED` 503 at **20.86 s**; login/search failed fast in ~2.0 s (they need the catalog); snapshot-routed reads kept returning 200; recovery was automatic **4.03 s** after Postgres was ready; the worker survived (pool guard).

### 10.5 Worker-ID leases

A **separate contract** from the registry, in `pg-catalog.worker_id_leases` (TTL 60 s, renew 10 s, margin 15 s → 45 s local window). Registry validity and lease validity are independent; whichever expires first limits the process — and the registry always does.

### 10.6 Failure matrix (verified)

| Failure | Detection | Immediate effect | Recovery | Data lost? |
|---|---|---|---|---|
| **API replica** | NGINX `max_fails=2` | 0 of 6,330 requests failed; dead peer ejected 10 s | Rejoined automatically | No |
| **All API replicas** | NGINX | 502 in ~7–10 ms | — | No |
| **Worker** | BullMQ + heartbeat | Batch honestly partial while dead | Redelivery → COMPLETED 906 = 128 + 778; **0 duplicate** (employee, period) rows | No |
| **redis-kv** | Client error | Fail-closed scopes 503 ≤ 2.1 s; fail-open keep 200 | Bounded queue errors; no PG corruption | No |
| **redis-queue** | Producer timeout | `QUEUE_UNAVAILABLE` (502) + batch marked FAILED, ≤ 2.4 s | Healthy POST → 202 → COMPLETED | No |
| **shard-2** | Pool error | Routed writes 503 @ 0.03 s; scatter reads 200 + `meta.partial` | Idempotent recovery; duplicate check-in returns the original row | No |
| **pg-catalog** | Heartbeat failure | Writes stop at +20 s; login/search 503 ~2.0 s | Automatic within one heartbeat (4.03 s) | No |
| **Migration / stale writer** | Durable gate marker | Write refused 503 `GATE_CLOSED` | Map revert via same-epoch CAS | No |

---

## 11. API Surface

Base path `/api/v1` (health, metrics and the env-gated test helpers are unversioned). Every response carries `x-request-id`; every replica also sets `x-api-instance` to its `API_PORT`.

### 11.1 Envelopes

```json
{ "success": true,  "data": … }
{ "success": false, "error": { "code": "…", "message": "…", "details": … } }
```

Scatter-gather reads add honesty metadata instead of silently returning partial data:

```json
"meta": { "partial": true, "unavailable": ["shard-2"] }
```

Error codes in use: `VALIDATION_ERROR`, `FORBIDDEN`, `UNAUTHENTICATED`, `INVITATION_EXPIRED`, `STATUS_EXPIRED`, `DEPENDENCY_UNAVAILABLE`, `GATE_CLOSED`, `QUEUE_UNAVAILABLE`, `LIMITER_UNAVAILABLE`, `RATE_LIMITED`, `ID_LEASE_UNAVAILABLE`, `CODE_COLLISION`, `INTERNAL`.

### 11.2 Route groups

| Group | Base | RBAC | Limiter scope |
|---|---|---|---|
| auth | `/auth` | public: `login`, `refresh`, `logout`, `accept`, `forgot-password`, `reset-password`; HR/Admin: invitations | `login`, `accept`, `recover` |
| employees | `/employees` | HR/Admin writes; Manager team reads; employee `self` | — |
| attendance | `/attendance` | employee self; HR/Admin corrections | — |
| leave | `/leave` | employee apply/cancel; Manager team approve/reject; HR/Admin override | — |
| payroll | `/payroll` | HR/Admin structures + batches; employee own payslips | — |
| jobs | `/jobs` | public board; HR/Admin CRUD | `jobs` |
| recruitment | `/recruitment` | HR/Admin pipeline; public `apply` | `apply` |
| sourcing | `/recruitment/sourcing` | HR/Admin | `crawl` |
| reports | `/reports` | HR/Admin; manager team views | — |
| performance | `/performance` | HR/Admin cycles; employee goals/self-review; manager team reviews | — |
| notifications | `/notifications` | authenticated (own rows) | — |
| search | `/search` | authenticated; suggest scope | `search`, `suggest` |
| short links | `POST /api/v1/short-urls`, `GET /s/:code` | HR/Admin create; public redirect | `short` |
| admin | `/admin` | **Admin only** | — |
| system (test) | `/system/test/*` | env-gated `ALLOW_TEST_LIMITER_RESET=true` | — |
| health | `/health`, `/system/map-version` | public | — |
| metrics | `/metrics` | `METRICS_TOKEN` header **or** internal socket peer | — |

Full endpoint list (98 route registrations across 16 route modules) — representative subset:

```text
POST   /api/v1/auth/{login,refresh,logout,invitations,accept,forgot-password,reset-password}
GET    /api/v1/employees            PATCH /api/v1/employees/me        GET  /api/v1/employees/team
GET    /api/v1/employees/:id        GET  /api/v1/employees/:id/activity
POST   /api/v1/employees/onboard    POST /api/v1/employees/:id/deactivate
POST   /api/v1/attendance/{check-in,check-out,corrections}   GET /api/v1/attendance/{me,day,reports}
GET    /api/v1/leave/balances       POST /api/v1/leave/requests      GET /api/v1/leave/requests
POST   /api/v1/leave/requests/:id/{approve,reject,override,cancel}  GET /api/v1/leave/policies
POST   /api/v1/payroll/structures   POST /api/v1/payroll/batches     GET /api/v1/payroll/{batches,me,payslips/:id}
GET    /api/v1/jobs                 GET /api/v1/jobs/suggest         GET /api/v1/jobs/:slug
POST   /api/v1/jobs                 POST /api/v1/jobs/:jobId/close
POST   /api/v1/recruitment/applications  GET /api/v1/recruitment/application-status/:token
GET    /api/v1/recruitment/{candidates,applications}  POST /api/v1/recruitment/applications/:id/{stage,…}
POST   /api/v1/recruitment/sourcing/runs   GET /api/v1/recruitment/sourcing/runs[/:id]
GET    /api/v1/reports/overview     GET/POST /api/v1/performance/{cycles,goals,reviews,team,summary}
GET    /api/v1/notifications        GET /api/v1/notifications/unread-count   GET/PUT /api/v1/notifications/prefs
GET    /api/v1/search/suggest       POST /api/v1/short-urls           GET /s/:code
GET    /api/v1/admin/{audit-logs,shards,users,settings/lookups}
POST   /api/v1/admin/{rebuild-directory,shards/preview,shards/migrate,settings/*,users/:id/roles}
GET    /api/v1/admin/shards/runs/:id  POST /api/v1/admin/shards/runs/:id/abort
```

---

## 12. Background Processing

### 12.1 Queue topology

One BullMQ queue, `hrms`, with five job types:

| Job | Triggered by | Idempotency |
|---|---|---|
| `payroll-chunk` | `POST /payroll/batches` — one per active shard | `ON CONFLICT DO NOTHING` on `(record_id)`; per-shard bookkeeping upsert |
| `notification` | Dispatcher (`LEAVE_DECIDED`, `REVIEW_RELEASED`) | `ON CONFLICT DO NOTHING` on `notification_id` |
| `crawler-run` | `POST /recruitment/sourcing/runs` | Email-claim table (`ON CONFLICT DO NOTHING`) |
| `announcement-fanout` | `POST /notifications/announcements` | `notification_id = {announcement}:{employee}` |
| `test-job` | tests | echo |

### 12.2 Producer vs consumer failure semantics

- **Producers are fail-fast bounded**: `maxRetriesPerRequest: 1`, `connectTimeout: 2000`, `commandTimeout: 2000`, `skipWaitingForReady: true`. A Redis outage therefore produces an honest 502/503 in ~2.4 s instead of a hang. (Without `skipWaitingForReady`, BullMQ awaits the connection's `ready` event forever and the finite-retry rejection is never reached.)
- **Consumers keep unbounded retries** so BullMQ can redeliver.
- Job ids: `attempts: 3`, exponential backoff 1 s, `removeOnComplete: 100`, `removeOnFail: 500`. Job ids are **colon-free** and never raw numeric Snowflakes.

### 12.3 Payroll fan-out

```text
POST /payroll/batches
  → catalog txn: INSERT payroll_batches (PENDING) + audit row  (fails if the catalog gate is closed)
  → one enqueue per active shard: jobId = {batchId}-{shard}
  → on enqueue failure: batch → FAILED, respond 502 QUEUE_UNAVAILABLE
  → 202 { batchId, period, status: PENDING }

worker: payroll-chunk per shard
  → read holidays from the catalog; count scheduled workdays
  → read active employees (≤500), salary structures, PRESENT/LATE attendance, APPROVED leave
  → paid = min(scheduled, present + paidLeave); unpaid = scheduled - paid
  → computePay() in integer paise
  → INSERT payroll_records ON CONFLICT DO NOTHING  + notification row
  → UPSERT payroll_batch_shards (batch_id, shard) — idempotent, so a retried chunk
     rewrites its own row instead of inflating the batch totals
  → recompute the aggregate; COMPLETED / PARTIAL_FAILED when all shards reported
```

**Measured (scenario E):** worker killed mid-batch → the batch stays `RUNNING` with honest partial totals; on restart redelivery → `COMPLETED 906 = 128 + 778` with **0 duplicate** `(employee_id, period)` rows across all four shards.

### 12.4 The dispatcher loop

Every 2 s the worker drains shard outboxes. Events handled: `EMPLOYEE_CREATED`, `EMPLOYEE_UPDATED`, `EMPLOYEE_DEACTIVATED`, `LEAVE_DECIDED`, `REVIEW_RELEASED`, `AUDIT`. Each is applied idempotently by event id with a version guard.

---

## 13. Security

| Area | Implementation |
|---|---|
| Passwords | Argon2id (`argon2` npm) |
| Access tokens | JWT, **10-minute** TTL (D-005) — the documented revocation bound |
| Refresh sessions | Rotating refresh token in an httpOnly `SameSite=Lax` cookie, with **reuse detection**; session state in `redis-kv` (`session:{id}`, `usersessions:{userId}`) |
| CSRF | Double-submit token on cookie-authenticated unsafe requests; the web app sends `x-csrf-token` from `sessionStorage` |
| Invitations | Single-use token, hash stored, 7-day expiry (D-011) → 410 `INVITATION_EXPIRED` |
| Password reset | 30-minute single-use token (D-018), enforced with `SELECT … FOR UPDATE` on a `PENDING` row; issuing a new reset expires earlier ones; reset revokes all sessions |
| Candidate status | 32 random bytes hex, stored hashed with a `revoked` flag, 30-day TTL (D-010) → 410 `STATUS_EXPIRED` |
| Uploads | Multer in-memory, **5 MiB** cap (D-012), declared type **and magic-byte** checks, **random object keys** that never leak filenames or shard identity |
| Short links | Destination allow-list (`/jobs`, `/jobs/*`) only; codes and status tokens are rate-limited to bound enumeration |
| Metrics | Gated by `METRICS_TOKEN` header **or** the raw socket peer (loopback / RFC1918 / ULA / link-local) — deliberately **not** `req.ip` and **not** forwarded headers, so a client cannot spoof its way in; NGINX also returns 403 for `/metrics` |
| Trust proxy | `TRUST_PROXY` parsed strictly (IPv4 / IPv6 / CIDR / hop count); **anything else throws at boot** |
| Deactivation | Login blocked, all sessions revoked, autocomplete entries removed, removed from directory search and report counts |
| Object storage | Presigned GET with expiry; no replica-local file storage |
| Secrets | `.env` is git-ignored; `.env.example` ships only local defaults (`JWT_SECRET=dev-only-change-me`) |

---

## 14. Observability and Operations

### 14.1 Metrics

**API** (`apps/api/src/routes/metrics.ts`): `hrms_http_requests_total{method,route,status}`, `hrms_http_request_seconds{method,route}` (histogram), `rate_limit_allowed_total{scope}`, `rate_limit_rejected_total{scope}`, plus prom-client default process metrics.

**Worker** (`apps/worker/src/index.ts`): `worker_jobs_processed_total{name}`, `worker_jobs_failed_total{name}`, `worker_job_duration_seconds{name}`, and gauges `queue_waiting`, `queue_active`, `queue_completed`, `queue_failed` (polled every 15 s).

### 14.2 Prometheus + Grafana

Prometheus scrapes **10 targets**: the API, the worker, 5 postgres exporters, 2 redis exporters, cAdvisor. Grafana ships **3 provisioned dashboards** — `api-overview`, `worker-queue`, `shards-redis` — with a provisioned datasource.

**Alert rules** (`infrastructure/monitoring/alerts.yml`): `RedisKvMemoryHigh` fires when `redis_memory_used_bytes / redis_memory_max_bytes > 0.8` for 5 minutes.

### 14.3 Health and diagnostics

- `GET /health` → per-dependency status: `{"catalog":"up","shard-1":"up:OPEN","shard-2":"up:OPEN",…}`. The `up:OPEN` suffix is the shard's **write-gate state**, so health also tells you whether writes are currently possible.
- `GET /system/map-version` → the routing-map version this process has loaded.
- `GET /api/v1/admin/system-health` → the admin UI view of the same.

### 14.4 Ingress

NGINX round-robins the three API replicas with `max_fails=2 fail_timeout=10s`; `/metrics` is a hard 403 at the ingress; `X-Real-IP` and `X-Forwarded-For` are set so the limiter sees the true client IP. Switching to `least_conn;` is a one-line change (documented as the alternative to benchmark).

---

## 15. Measured Results

Method (`docs/experiments/00-method.md`): k6 v2.2.0 on the **same laptop** as the stack (so the numbers are *comparative*, not production claims); each workload run 3 times; **percentiles are never averaged** — per-run values are shown, then median [range]; the rate limiter is bypassed only for throughput runs (the bypass is test-only and inert in production); every raw artifact is committed.

### 15.1 Workloads (0 % failures everywhere)

| Profile | p50 | p95 median [range] | p99 median [range] | Throughput | Errors |
|---|---|---|---|---|---|
| Low (10 rps) | 6 / 7 / 8 | **71** [49–75] ms | 122 [92–707] ms | 1,530 reqs / 3 m ≈ 8.5 req/s | 0 % |
| Medium (30 rps) | 7 / 8 / 8 | **117** [27–120] ms | 140 [123–143] ms | 6,330 reqs / 4 m ≈ 26.4 req/s | 0 % |
| High (60 rps) | 6 / 7 / 7 | **41** [29–71] ms | 124 [97–135] ms | 19,830 reqs / 6 m ≈ 55.1 req/s | 0 % |
| 9 AM check-in burst | 7 / 7 / 8 | **12** [9–16] ms | 16 [12–18] ms | 3,925 reqs / 1 m 20 s ≈ 49.1 req/s | 0 % |

Project targets (the thresholds the scripts enforce): overall p95 < 2,000 ms, p99 < 4,000 ms; burst failed < 15 %, check-in p95 < 3,000 / p99 < 6,000 ms. **All clear.**

> Known display quirk: the `mixed-medium` and `burst` raws end with a `✗` glyph despite every JSON summary reporting 0 % failed and all thresholds cleared. Cause: a k6 v2.2.0 progress-bar bug (k6 #2951) in the ramping-arrival-rate executor when the run finishes just before its nominal duration. The end-of-run JSON summaries are the record.

### 15.2 Component comparisons (fair baselines)

| Comparison | Result |
|---|---|
| **Ring vs modulo** (20 k keys, add a node) | **24.9 %** [24.8–25.4] vs **74.4 %** [74.4–74.5] remap |
| **Rate limiter under overload** | 98.0 / 98.6 / 98.7 % rejected of ~2,400 bad logins; only 401/429 observed; p50 3 ms / p95 5 ms |
| **Snowflake IDs** | ≈2.9 M IDs/s single worker; 200,000 unique across 4 threads, **0 duplicates**, 3/3 runs |
| **Fenced vs bare write** | median overhead **24.2 %** [−3.9–37.6] — within run-to-run noise at this scale; one negative reading kept |
| **Autocomplete cache vs indexed catalog** | ≈25 ms p50 on **both** legs — the cache never served in that stack state, so the measured delta is catalog-vs-catalog. Reported as inconclusive, not as a win |
| **Scatter vs single-shard read** | reported with limits |

### 15.3 Failure & scalability scenarios

| Scenario | Raw | Outcome |
|---|---|---|
| **B + K** live shard-add | `scenario-K.txt` | COMPLETED, run `105573391162945536`: 64 buckets, 8,801 rows, checksums, counts equal, gates reopened; caught and fixed a snapshot-staleness 404 |
| **C** replica scaling | `scenario-C.txt` | 6/6 round-robin probes via `x-api-instance`; medium profile sustained; p95 62 ms with 3 backends |
| **D** API kill mid-load | `scenario-D.txt` | **0 of 6,330** requests failed; dead peer ejected after `max_fails=2`, rejoined after 10 s; all-dead → 502 in ~7–10 ms |
| **E** worker kill (payroll) | `scenario-E.txt` | honest partial while dead; restart → COMPLETED 906 = 128 + 778; **0 duplicate** employee-period rows |
| **F** Redis queue + KV outage | `scenario-F.txt` | fail-closed 503 ≤ 2.1 s; fail-open keep 200; bounded queue errors; 0 phantom keys; no PG corruption |
| **G** 9 AM burst | `burst-r{1,2,3}.txt` | failed **0 %**, check-in thresholds cleared |
| **I** shard-2 outage | `scenario-I.txt` | routed writes 503 @ 0.03 s; scatter reads 200 with `meta.partial`; idempotent recovery |
| **J** catalog outage | `scenario-J.txt` | writes live to +20 s, first `GATE_CLOSED` @ 20.86 s; login/search 503 ~2.0 s; recovery 4.03 s after Postgres ready; worker survives |
| **K** migration + stale writer | `scenario-K.txt` | full protocol completed live; stale writer refused |

### 15.4 Resource usage

`docker stats --no-stream` snapshot committed as `docs/experiments/raw/resource-snapshot.txt`; the observability profile adds cAdvisor and Grafana for continuous per-container CPU/memory.

### 15.5 The PRD §34 acceptance walk

88 items — **20 functional, 47 system-design, 6 infrastructure, 15 evaluation** — walked one by one against the final branch, each row pointing at a test name, a committed raw file, a commit, or an artifact. The walk itself found **two genuinely unclosed items** that an earlier audit had missed (public-jobs autocomplete; the migration table-ownership CI check); both were implemented in a single fix wave and re-verified. The full table lives in `docs/evaluation.md`.

---

## 16. The Frontend

- **50 route files** under `apps/web/app`, covering the whole product: landing, login, register, forgot/reset password, dashboard, profile, attendance, leave (+ apply), payroll (+ payslip), performance, notifications, settings, the manager area, the full HR area, the admin area, and the public recruitment surfaces (`/jobs`, `/jobs/[slug]`, `/jobs/[slug]/apply`, `/application-status`).
- **Design language** (`docs/design.md`): Airbnb-derived — pure-white canvas, Rausch `#ff385c` as the single accent, Airbnb Cereal VF (Inter substitute), 8 px spacing base, one shadow tier, pill search bar with a circular search orb, photo-first cards, one elevation tier everywhere.
- **Components** in `apps/web/components/ui.tsx`: `Button` (primary/accent/outline), `Card`, `Badge`, `TextInput`, `EmptyState`, `PageHeader`, plus `app-shell.tsx` (role-aware sidebar + topbar with live autocomplete), `jobs-search.tsx`, `leave-decision.tsx`.
- **Data honesty:** the web app never invents measurements. The API is the only source of truth.
- **Playwright e2e**: 14 serial flows against the production build — landing, login, invitation acceptance, employee lifecycle, attendance, profile save, leave apply→approval, payroll run→payslip, public hiring without login, sourcing run, performance cycle→released review, admin pages, profile menu, admin navigation.

### 16.1 Live UI acceptance walk

`docs/ui-walkthrough.md` records the whole product driven through a real Chrome browser via Playwright MCP — phases A–L — with **17 findings (F1–F17)** recorded, severity-tagged and left open. See §20.

---

## 17. Verification and Test Inventory

### 17.1 What I ran on 2026-10-21 (this document's author)

```text
npm ci                                     → 115 packages installed
npm run typecheck                          → ✅ 5/5 workspaces clean
                                             (requires building @hrms/core first — see §20.4)
npm run check:pool-access                  → ✅ pool-access-ok
npm run check:shard-tables                 → ✅ shard-owned-tables-ok (owned: 16, declared: 16)
npm --workspace @hrms/core run test        → ✅ 13 files / 40 passed | 4 skipped
npm --workspace @hrms/api run test         → ✅ 24 files / 73 passed | 1 skipped   (48 s)
npm --workspace @hrms/web run build        → ✅ Next 15.5.27 production build clean
npm --workspace @hrms/web run e2e          → ✅ 14 passed (16.9 s)
```

The API and core numbers match `docs/report.md` exactly.

### 17.2 Test inventory (37 suites)

**Core (13 files / 40 tests | 4 skipped)** — `bucket` · `ring` · `golden-vectors` · `map-equality` · `load-active-map` · `routing-cache` · `snowflake` · `id-issuer` · `kv` · `dispatcher` · `payroll` · `crawler` · `registration`.

**API (24 files / 73 tests | 1 skipped)** — `admin-users` · `announcements` · `attendance-leave` · `attendance-reports` · `auth` · `catalog-gate` · `employees` · `employees-activity` · `fence-coverage` · `gate` · `identity` · `infra` · `jobs-suggest` · `migration` · `migration-gate` · `password-reset` · `payroll` · `payroll-retry` · `performance` · `recruitment` · `reports` · `seed-routing` · `sourcing` · `trust-proxy`.

**E2E (14)** — see §16.

### 17.3 CI guards

| Guard | Command | Protects |
|---|---|---|
| Direct shard-pool access ban | `bash scripts/check-direct-pool-access.sh` | Every shard write goes through the fenced `ShardRouter` (D-007/D-020) |
| Migration ownership | `node scripts/check-shard-owned-tables.mjs` | No `bucket_id` table may exist in migrations without a manifest declaration (NFR-MIG-03) |
| Full CI | `npm run ci` | typecheck → lint → both guards → all workspace tests |

---

## 18. Build Phases and Status

| Phase | Scope | State | Date |
|---|---|---|---|
| 1a | Walking skeleton: workspace, `@hrms/core`, catalog + 3 shards + standby, routing primitives, write-fence boundary, ownership manifest + CI rule, IDs + registry schemas, seed, minimal login→dashboard→directory, observability | ✅ | 10-10 |
| 1b | redis-queue + redis-kv, queue abstraction, S3 (moto), Mailpit, NGINX, Compose profiles, `.env.example`, pool budgets, Prometheus/Grafana wiring | ✅ | 10-10 |
| 2 | Invitations, Argon2id + JWT + rotating refresh + CSRF, RBAC, atomic audit, Redis token bucket with per-endpoint outage policy | ✅ | 10-10 |
| 3 | Employee lifecycle, activation, directory, outbox + dispatcher, Snowflake + durable leases, autocomplete index, admin rebuild | ✅ | 10-10 |
| 4 | Attendance (idempotent, late rule, reports, HR corrections), leave (manager→HR chain, no-manager fallback, self-approval block, HR override, cancel restores balance, reassignment on deactivation) | ✅ | 10-10 |
| 5 | Salary structures, paise-integer payroll math, async chunked batches, payslips, publish idempotency | ✅ | 10-10 |
| 6 | Jobs CRUD + public board, applications + resume validation, stage machine, candidate routing domain, short links with allow-list | ✅ | 10-10 |
| 7 | Candidate portal fixture, crawler + parse/normalize/dedupe, sourcing runs, HR sourcing UI | ✅ | 10-10 |
| 8 | Performance cycles/goals/reviews, scatter-gather reports with `meta.partial`, full web UI | ✅ | 10-18 |
| 9 | Shard-add migration control plane: preview → gates → copy → checksum → smoke → cutover → rollback | ✅ | 10-19 |
| 10a | Load/bench harness (k6 profiles + 4 Node benchmarks) | ✅ | 10-19 |
| 10b | Scale hardening: catalog write gate, shard write fences, pool timeouts, registration deadline, routing/identity snapshot, `KvStore`, bounded queue outage, NGINX replicas + trust proxy, worker/admin observability | ✅ | 10-19 |
| 10c | Acceptance-gap closure (22 tasks) + the 88-item §34 walk + final verification | ✅ | 10-19 |
| **11** | **AWS deployment** | ⛔ **NOT STARTED** — deferred by design (PRD §40 marks it optional) | — |

---

## 19. Decision Log

`docs/decisions.md` records **D-001 … D-020**, each with the chosen value, the reason, the rejected alternatives and a `file:line` citation. The ones that shape the architecture:

| ID | Decision | Value |
|---|---|---|
| D-001 | Ring virtual-node count | **V = 128** per shard |
| D-002 | Registry heartbeat / TTL / margin | 5 s / 30 s / 10 s → **~20 s local write deadline** |
| D-003 | Worker-ID lease TTL / renew / margin | 60 s / 10 s / 15 s → **45 s local window** |
| D-004 | Migration gate polling / ack timeout | 250 ms / 10 s; same-epoch CAS abort |
| D-005 | Access-token TTL | **10 minutes** (the revocation bound) |
| D-007 | Fenced write boundary | one `ShardRouter` wrapper; direct pool access banned in CI |
| D-008 | Fence-overhead protocol | ≥ 3 warmed runs vs a benchmark-only control |
| D-009 | Autocomplete K / prefix / TTL / ranking | 20 / 12 chars / 7 days / recency |
| D-010 | Candidate status token | 30 days, hashed, revocable |
| D-011 | Invitation expiry | 7 days |
| D-012 | Upload cap | 5 MiB (+ declared type + magic bytes) |
| D-013 | Redis-KV memory | 256 MB, `noeviction`, alert at 80 % for 5 min |
| D-014 | Workload targets | k6 10 / 30 / 60 rps; p95 < 2 s, p99 < 4 s |
| D-015 | Bucket count + hash | **256 buckets**, SHA-256 first-4-bytes big-endian; 128 vnodes |
| D-016 | Payroll demo percentages | PF 12 %, tax 10 % |
| D-017 | Registry write deadline | TTL − margin = 20 s; the earlier deadline binds |
| D-018 | Password reset | 30 min, single-use, `FOR UPDATE` |
| D-019 | Rate-limit scopes | 9 scopes with explicit fail-open/closed policy |
| D-020 | Worker direct-pool exception | named exceptions + `guardPool` idle-client guard |

### 19.1 Architecture trade-offs (PRD §37)

| Decision | Choice | Trade-off |
|---|---|---|
| Monolith vs microservices | Express modular monolith + separate worker + separate portal app | Domain clarity without a service per module |
| BullMQ vs Kafka | BullMQ over Redis (SQS on AWS) | Task-oriented jobs; no event replay/streaming requirement |
| Physical shards vs RDS cost | 3 physical PG containers locally; AWS may use one RDS with logical separation, clearly labelled | Proves real routing locally without 3× RDS cost |
| Shard key | Stable UUID → fixed buckets → versioned ring | No cross-shard joins or FKs; global queries need projection or scatter-gather |
| Consistent hashing vs LB | NGINX balances HTTP; the ring maps buckets to shards | Two distinct layers, each with one job |
| ID generation | UUID for identity; Snowflake for operational records; leased worker IDs | Coordination cost, bounded by a fail-closed lease |
| Redis roles | Separate queue and KV instances; no cluster | Logical separation, not Redis Cluster |
| Consistency | Strong inside the owning shard; eventually consistent projections; idempotent cross-DB | Explicit, with measurable staleness windows |

---

## 20. Known Findings, Gaps and Limitations

### 20.1 The 17 live UI findings (`docs/ui-walkthrough.md`)

Recorded by driving the real UI in Chrome. **None are fixed**; they are the honest state of the product.

| # | Finding | Severity |
|---|---|---|
| F1 | `favicon.ico` 404 on every page load | Minor |
| F2 | Signed-out renders the full app chrome instead of redirecting to `/login` | Minor |
| **F3** | **Public apply always stores `experience_years = 0`** — the web form submits multipart strings, the API requires a number | **Major (data loss)** |
| F4 | Uploaded resume never surfaces in the HR UI | Minor |
| F5 | "Edit job" / "Close job" have no web control (API-only) | Moderate |
| **F6** | **Invitation tokens are never delivered to anyone** — no invitation email template exists; the token is returned by the API and discarded. A real invitee can neither receive nor be given the token | **Major (golden-path blocker)** |
| F7 | The web app never calls `POST /auth/refresh`; after 10 min the session silently stops loading data | Moderate |
| F8 | `/admin/audit-logs` builds its URL with `&limit=50` instead of `?` → 404 and a misdiagnosed error page | Moderate |
| F9 | Employee attendance renders a raw ISO timestamp instead of a formatted date | Minor |
| F10 | No web control assigns an employee's manager (`manager_id`) — manager routing therefore always goes to HR from the UI | Moderate |
| F11 | `/manager/leave` shows Approve/Reject on `PENDING_HR` rows the manager cannot decide | Minor |
| **F12** | **Mid-month payroll counts every workday without a PRESENT/LATE row as LOP** (including future days and pre-hire days) while PF/tax are deducted at full month → **negative net pay** observed (−₹12,076.10 and −₹15,199.93) | Moderate (pay correctness) |
| **F13** | **Approved leave is counted one day early** — `toISOString().slice(0,10)` on a DATE parsed at local midnight shifts the window back a day on an IST host; a 2-day sick leave counted as 1 workday → one extra LOP day (₹4,761.90) | Moderate (pay correctness) |
| F14 | Reviews can be written and submitted but **never released from the web UI** | Moderate |
| **F15** | **`GET /api/v1/performance/team` fails on every owned shard** — the query forces the param to text (`$2::text`) then compares `e.manager_id = $2` → `operator does not exist: uuid = text`; per-shard errors are swallowed into `partial.unavailable`, so the manager review list is always empty | Moderate |
| F16 | Role-gated HR pages render for employees with misleading copy (data is not exposed) | Minor |
| F17 | Deactivation is one-way — no reactivate endpoint exists | Minor |

**F3, F6, F12, F13 and F15 are the ones that matter.** They are genuine product defects, and the project's own walkthrough documents them rather than hiding them.

### 20.2 Evaluation-side limitations (stated, not hidden)

- All performance numbers are **comparative, single-laptop** numbers — the load generator shares the machine with the stack.
- The dataset is **small by design** (190 people, < 1 k attendance rows): sharding's benefits here are *structural* (routing, migration, isolation), not throughput-visible.
- Moto S3 stands in for MinIO (the registry proxy blocked the MinIO image); the storage adapter is unchanged.
- Candidate-domain audit delivery is best-effort via the shared dispatcher.
- The autocomplete cache leg of its benchmark was **inconclusive** and is reported as such.
- The rate limiter is bypassed for throughput runs only (test-only, inert in production).

### 20.3 Explicitly out of scope

Phase 11 (AWS) · shard *removal* / data drain · advanced analytics · the optional Firecrawl provider · expanded dashboards · Saga orchestrator / distributed locks · Kubernetes · Kafka.

### 20.4 Reproducibility gaps I hit while re-verifying (2026-10-21)

These are **not** in the project's own docs. They are fresh-clone / fresh-stack issues I hit running the documented commands, and they are worth fixing.

| # | Gap | Impact | Fix |
|---|---|---|---|
| **R1** | **`npm run ci` fails on a fresh clone.** `@hrms/core` has `main: dist/index.js` / `types: dist/index.d.ts`, but `dist/` is git-ignored and `ci` does not build it. The worker typecheck then fails with `Cannot find module '@hrms/core'` and cascading `TS7006` implicit-any errors. | `npm run ci` is the project's headline verification command and it does not work from a clean checkout. | Add `npm --workspace @hrms/core run build` to the front of the `ci` script (or add a `prepare`/`prebuild` hook). |
| **R2** | **The documented quick start fails on a fresh database.** `README.md` says: migrations → `seed.cjs` → `seed-demo.cjs`. But `seed.cjs` only *reads* `routing_map_buckets WHERE version = 1`; **no migration or script creates routing-map version 1**. The seed dies with `unexpected owner undefined for bucket 156`, and `seed-demo.cjs` then dies with `Cannot read properties of undefined (reading 'query')`. `seedRoutingMapV1()` exists in `@hrms/core` and is exported, but nothing calls it. | A new operator cannot reproduce the stack from the README. | Call `seedRoutingMapV1(catalog, ACTIVE_SHARDS)` at the start of `seed.cjs` (idempotent) before the people loop. |
| **R3** | **The API test suite fails unless the API process itself was started with `ALLOW_TEST_LIMITER_RESET=true`.** The per-test reset route returns 404 without it, so the suite's many `hrLogin()` calls exhaust the 30/min `login` bucket and fail with 429 (17 of 24 files failed in my first run). The README's verify block omits the flag. | The documented verify command does not work; the failure looks like an application bug rather than a missing env var. | Document `ALLOW_TEST_LIMITER_RESET=true` in the README verify block, and/or have the suite detect a 429 and print that hint. |
| **R4** | `apps/worker/src/index.mjs` is a **dead Phase-1b stub** (`"worker stub: queue wiring arrives in Phase 1b/5"`) sitting next to the real `index.ts`. | Confusing for a reader; `npm run dev` uses `index.ts`, so the stub is never executed — but it misleads. | Delete it. |
| **R5** | The `compose` stack hard-codes `redis-queue` to host port **6379**, which collides with any other project's Redis on the same machine (it did on this one). | `docker compose up -d` fails with "port is already allocated" for anyone running another stack. | Document the override, or make the published port configurable via an env var with a default. |

Everything else in the documented flow worked exactly as written: migrations applied cleanly (catalog + 4 shards, 20 files), the demo seed completed, the API and worker booted, `/health` reported all five databases `up`, and every test suite passed.

### 20.5 Documentation drift

- `docs/report.md` describes the repo as living on `feat/remaining-8-11-plus-premium-ui` with `master` as the Phase-7 baseline; the repo now has `main` as the default branch with 69 commits (at `203f74f`).
- `docs/context.md` and `docs/report.md` reference `api-env.sh`, which is not in the repository.
- `docs/report.md` §3.3 says the 88-item walk "found exactly two genuinely unclosed items" — accurate — but the surrounding narrative still reads as pre-merge.

---

## 21. Running and Re-verifying the Project

### 21.1 Requirements

Node ≥ 22 · Docker Desktop (or a Docker Engine with Compose v2) · ports 5438–5442, 6379, 6380, 5000, 1025, 8025, 4100, 8080 free · one replica of the app's own stack.

### 21.2 Quick start

```bash
cp .env.example .env
docker compose up -d                                   # catalog + 4 shards + 2 redis + s3 + mailpit + portal + nginx
set -a && . ./.env && set +a

node infrastructure/postgres/runner.mjs                # migrations (immutable once run)
NODE_PATH=apps/api/node_modules node infrastructure/postgres/seed.cjs        # routing maps + HR user
NODE_PATH=apps/api/node_modules node infrastructure/postgres/seed-demo.cjs   # demo people + data

npm --workspace @hrms/api run dev                      # API  :4000
npm --workspace @hrms/worker run dev                   # worker + metrics :4001
npm --workspace @hrms/web run dev                      # web   :3000
```

> **On a fresh database, run the routing-map seed first** (see R2 in §20.4). The canonical call is `seedRoutingMapV1(catalog, [...ACTIVE_SHARDS])` from `@hrms/core`; it is idempotent.

> **Build `@hrms/core` before typechecking** (see R1 in §20.4):
> `npm --workspace @hrms/core run build`

### 21.3 Scaling to three API replicas

```bash
API_PORT=4002 npm --workspace @hrms/api run dev
API_PORT=4003 npm --workspace @hrms/api run dev
docker compose up -d nginx
for i in {1..6}; do curl -sD- -o /dev/null localhost:8080/health | grep -i x-api-instance; done
```

### 21.4 Verify

```bash
npm --workspace @hrms/core run build            # required on a fresh clone (R1)
npm run ci                                      # typecheck + lint + guards + all workspace tests

# the API suite needs the API *process* running with the limiter reset enabled (R3)
ALLOW_TEST_LIMITER_RESET=true npm --workspace @hrms/api run dev &
MAIL_LIVE=1 npm --workspace @hrms/api run test

npm --workspace @hrms/web run build
npm --workspace @hrms/web run e2e                # needs web on :3000 and the API stack up

k6 run -e API=http://localhost:8080 tests/load/smoke.js
k6 run -e API=http://localhost:8080 -e PROFILE=medium tests/load/mixed.js
k6 run -e API=http://localhost:8080 tests/load/burst.js
```

### 21.5 Observability profile

```bash
docker compose --profile observability up -d
# Prometheus :9090 (10 targets) · Grafana :3001 (admin/admin) · cAdvisor :8081
# exporters: postgres 9101–9105 · redis 9121/9122
```

### 21.6 Port map

| Port | Service |
|---|---|
| 3000 | Web app |
| 4000 / 4002 / 4003 | API replicas |
| 4001 | Worker metrics |
| 4100 | Candidate portal |
| 5000 | S3 (moto) |
| 1025 / 8025 | Mailpit SMTP / web UI |
| 5438 | pg-catalog |
| 5439 / 5440 / 5441 / 5442 | shard-1 / 2 / 3 / 4 (standby) |
| 6379 / 6380 | redis-queue / redis-kv |
| 8080 | NGINX ingress |
| 8081 | cAdvisor |
| 9090 | Prometheus |
| 3001 | Grafana |
| 9101–9105 / 9121 / 9122 | postgres / redis exporters |

### 21.7 Demo credentials

`hr@hrms.local` / `ChangeMe123!` (seeded, local-only). Additional walkthrough actors and per-page input values are in `docs/secrets.md`.

---

## 22. Glossary

| Term | Meaning in this project |
|---|---|
| **Bucket** | One of 256 logical slots; `sha256(lowercased-uuid)` first 4 bytes big-endian mod 256 |
| **Ring** | 128 virtual nodes per shard; maps buckets → physical shards; versioned and materialized |
| **Routing map** | The materialized 256-row `bucket → shard` table, versioned in the catalog |
| **Active map** | The routing-map version currently pointed at by `routing_map_versions.active` |
| **Fence** | A transaction-scoped `pg_advisory_xact_lock` plus a durable `shard_write_gate` check, in the same transaction as the write |
| **Gate** | A durable `GATED`/`OPEN` marker on a shard (or the catalog) that blocks writes |
| **Epoch** | The migration generation; gates are only reopened for the same epoch via CAS |
| **Registry** | `process_registry` in the catalog: who is alive, what map version they loaded, what gate they acked |
| **Local deadline** | A monotonic, locally computed expiry (~20 s) after which a process refuses writes without asking the catalog |
| **Lease** | A durable worker-ID claim in the catalog (TTL 60 s) that authorises Snowflake generation |
| **Outbox** | A table written in the same transaction as the business change, drained by the dispatcher |
| **Dispatcher** | The worker's 2 s loop that drains outboxes idempotently and updates projections |
| **Scatter-gather** | A bounded read across all owned shards, reporting `meta.partial` when some fail |
| **Owned bucket** | A bucket whose owner in the *active* map is that shard — the filter that prevents double counting |
| **Fail closed** | The limiter refuses the request (503) when its own KV is unavailable |
| **Fail open** | The limiter lets the request through, with a metric |
| **`x-api-instance`** | The response header that makes NGINX load balancing observable |
| **`x-request-id`** | Per-request correlation header set on every response |
| **Draining** | Waiting for in-flight fenced writes to complete before gating |
| **Golden vector** | A fixed UUID → bucket expectation checked into CI |

---

## 23. Document Index

| Document | What it answers |
|---|---|
| `PRD.md` (v2.5, 2,743 lines) | The specification: scope, FRs, NFRs, component mapping, migration protocol, phases, acceptance criteria, locked values |
| `README.md` | Quick start, compose profiles, replica recipe, verify commands |
| `docs/context.md` | The orientation map for maintainers/reviewers/demo operators |
| `docs/report.md` | Post-PRD implementation report: FR matrix, the eight components, infra inventory, measured results |
| `docs/status.md` | Phase-by-phase build tracker (measured only) |
| `docs/decisions.md` | D-001…D-020 with rationale and `file:line` citations |
| `docs/evaluation.md` | All measured numbers + the 88-item §34 acceptance walk with per-item evidence |
| `docs/api/overview.md` | Route groups, RBAC, envelopes, limiter scopes |
| `docs/shard-owned-tables.md` | Canonical table-ownership manifest (CI-checked) |
| `docs/design-system.md` | UI tokens and rules for `apps/web` |
| `docs/design.md` | The Airbnb design-language reference the tokens derive from |
| `docs/experiments/00-method.md` + `raw/` | Measurement method + 74 committed raw artifacts |
| `docs/ui-walkthrough.md` | Live UI acceptance walkthrough (Phases A–L) + 17 findings |
| `docs/secrets.md` | Demo logins + per-page input values |
| `docs/superpowers/plans/` | Execution plans: Phase 1a scaffold, phases 8–11, acceptance-gap closure |
| `infrastructure/postgres/migrations/README.md` | Migration file rules |
| `scripts/check-direct-pool-access.sh` | CI guard — direct shard-pool access ban |
| `scripts/check-shard-owned-tables.mjs` | CI guard — migration ownership |

---

## Appendix A — Quick Reference Card

```text
THE ONE IDEA
  employee/candidate id → SHA256 mod 256 = bucket → versioned 128-vnode ring
  → materialized routing map → physical shard → fenced write

DATABASES
  pg-catalog :5438  control plane (27 tables)
  shard-1..3 :5439-5441  active (44/43/47 employees)
  shard-4    :5442  standby, activated only by an audited migration
  redis-queue :6379 (BullMQ)   redis-kv :6380 (256 MB, noeviction)

THE EIGHT
  rate limiter   Lua token bucket, 9 scopes, per-scope fail policy
  sharding       256 buckets, 16 shard-owned tables, fenced writes
  hashing        128 vnodes, 24.9 % remap vs 74.4 % modulo
  KV store       KvStore interface over Redis, 2 instances
  ID generator   Snowflake 41/10/12, epoch 2026-01-01, leased worker ids
  shortener      Base62 codes, /jobs allow-list, 302 redirect
  crawler        simulated portal, email-claim dedupe, re-run = 0 dupes
  autocomplete   Redis zset, K=20, 12-char cap, 7-day TTL, recency

BOUNDARIES
  registration deadline ≈ 20 s  (heartbeat 5 / TTL 30 / margin 10)
  ID lease window      ≈ 45 s  (TTL 60 / renew 10 / margin 15)
  the EARLIER deadline binds

MIGRATION (live, run 105573391162945536)
  preview → gate → drain → ack → copy → checksum → cutover → smoke → resume
  64 buckets · 8,801 rows · checksums passed · counts equal · gates reopened

VERIFIED 2026-10-21
  typecheck ✅ · pool-access-ok ✅ · shard-owned-tables-ok 16/16 ✅
  core 13 files / 40 ✅ · API 24 files / 73 ✅ · web build ✅ · e2e 14/14 ✅

KNOWN OPEN (from the live UI walk)
  F3 apply loses experience_years · F6 invitation tokens undeliverable
  F12/F13 payroll LOP + leave off-by-one · F15 performance/team query broken
  R1 fresh-clone `npm run ci` fails · R2 quick-start seed needs the routing map
  R3 API suite needs ALLOW_TEST_LIMITER_RESET=true
```

---

*Compiled 2026-10-21 from `main` @ `0dd09d2`, re-checked 2026-10-23 against `main` @ `203f74f`. Every number quoted from `docs/evaluation.md` traces to a committed raw artifact in `docs/experiments/raw/`. Verification results in §17.1 were produced by running the commands in this document on `0dd09d2`. Nothing in this document is estimated or inferred without a source.*
