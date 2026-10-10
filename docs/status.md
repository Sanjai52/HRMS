# HRMS Build Status Tracker

Updated every time a phase (or sub-slice) lands. Measured results only; no invented numbers.

## Phase 1a — Walking skeleton: DONE (2026-10-10)

- Workspace (npm), `@hrms/core` (bucket SHA-256, ring V=128, ShardRouter, fenced writes), CI pool-access guard.
- Compose: `pg-catalog` :5438, shards :5439–:5442. Migrations `001_catalog_init`, `002_shard_init`. Routing map v1 seeded (97/78/81 buckets across shard-1/2/3).
- Seed: HR `hr@hrms.local` + 5 directory people via canonical routing; seed-routing test green.
- API: `POST /api/v1/auth/login` (Argon2id, 10-min JWT), `GET /api/v1/employees`, `/health`, `/system/map-version`. No Redis/refresh/rate-limit by design.
- Web (Airbnb DS, Tailwind v4): landing, login, shell sidebar+topbar, dashboard, directory, stubs.
- Tests: core 6/6, api 3/3 (gate, auth, seed-routing), web build green.

## Phase 1b — Remaining local infrastructure: DONE (2026-10-10)

- `redis-queue` :6379 (AOF, noeviction) + `redis-kv` :6380 (256mb, noeviction).
- `JobQueue` interface + BullMQ adapter in `@hrms/core`; worker consumes `hrms` queue (round-trip test green).
- Storage via S3 API: Moto stand-in on :5000 (proxy blocks MinIO pulls; MinIO remains the target, adapter unchanged). Mailpit :1025/:8025, round-trip green.
- NGINX :8080 → API with `max_fails` handling, verified against `/health`.
- API `/metrics` (request counter + latency histogram); Prometheus :9090 scrapes API directly; Grafana :3001 with provisioned datasource (`observability` profile).
- Connection budget: catalog pool 10 + 4 shard pools (10/10/10/5) per API replica; worker uses short-lived queue connections only.

## Phase 2 — Identity, RBAC, audit, rate limiting: DONE (2026-10-10)

- Migration `003_catalog_invitations` (partial unique index on active invitation emails).
- HR/Admin invitation create (single-use token, hash stored) + invitee accept (`INVITED→RESERVED`, concurrent duplicates 409, expiry 410, audit rows in same txn).
- Argon2id login unchanged + rotating Redis refresh sessions (httpOnly `SameSite=Lax` cookie, reuse detection) + double-submit CSRF on logout.
- RBAC matrix enforced server-side (`/employees` HR/ADMIN/MANAGER + `/me` self, audit-logs ADMIN-only, invitations HR/ADMIN); role-aware sidebar is hide-only.
- Redis Lua token bucket: login fail-closed (30/min/IP), search fail-open; `429 + Retry-After`; env-gated test reset (`ALLOW_TEST_LIMITER_RESET`, default off).
- Web: `/register` invitation-acceptance page, login stores CSRF, `lib/api` handles 401/429 with `credentials:include`.
- Tests: identity 6/6 (refresh rotation/reuse, CSRF logout, invite lifecycle, RBAC denials, burst 429).

## Phase 3 — Employee management, activation, directory: DONE (2026-10-10)

- Migrations `004_shard_outbox` (outbox_events, drained-not-copied) + `005_catalog_leases`.
- Snowflake IDs (41/10/12, epoch 2026-01-01, string JSON) with durable catalog leases (60s TTL, 10s renew, 15s margin); API acquires a lease at startup and fails event writes closed without one.
- Onboarding: invitation `RESERVED` → fenced shard employee insert + outbox `EMPLOYEE_CREATED` → invitation `ACTIVE` + atomic audit. Version-checked update (`409` on stale) and deactivation (login blocked, sessions destroyed, `AUDIT` outbox event).
- Dispatcher in worker (2s loop, `SKIP LOCKED`, version-guarded directory upserts, dead-letter after 10 attempts) + env-gated test trigger + Admin rebuild endpoint (audited, does not resurrect inactive).
- Autocomplete: Redis sorted-set prefix index (`org/all`), scoped suggest API with catalog fallback on miss; topbar dropdown wired to employee detail pages.
- Web: `/hr/employees/new` (invite + onboard), `/hr/employees/:id` (view/edit/deactivate), directory links, role-aware sidebar.
- Tests: lifecycle 4/4, serial suite 13/13 (rate-limit isolation via per-file reset + `--no-file-parallelism`).

## Phase 4 — Attendance and leave: DONE (2026-10-10)

- Migrations `006_shard_attendance_leave` (attendance, leave_balances/requests, notifications, manager_id) + `007_catalog_leave_config` (policies CASUAL/SICK/EARNED, 2026 holidays).
- Attendance: idempotent check-in/out, late-after-09:30, monthly history + summary, HR day view via owned-bucket scatter with `partial` metadata.
- Leave: weekday-only day count minus holidays, single-year guard, overlap + balance checks, `PENDING_MANAGER→PENDING_HR→APPROVED` chain with no-manager skip, self-approval block, HR peer rule, audited HR override with mandatory reason, cancel with balance restore, deactivation reassigns team requests to HR.
- `LEAVE_DECIDED` outbox → in-app notification on the requester's shard + email via worker (Mailpit-verified).
- Web: `/attendance`, `/leave` + `/leave/apply`, `/manager/team`, `/manager/leave`, `/hr/attendance`, `/hr/leave` (policies + override), `/notifications`, live dashboard cards.
- Tests: attendance-leave 6/6, serial suite 19/19.

## Phase 5 — Payroll: DONE (2026-10-10)

- Migrations `008_shard_payroll` (salary_structures, payroll_records with unique employee+period) + `009_catalog_payroll` (batches with done/failed/skipped).
- Paise-integer math in core with unit tests (gross/daily/LOP/PF/tax/net, half-up rounding, unpaid clamp); frozen month snapshots.
- Async batches: one idempotent `payroll-chunk` job per shard (colon-free job IDs), worker computes attendance + approved-leave inputs, `ON CONFLICT DO NOTHING` reruns, batch reaches `COMPLETED`/`PARTIAL_FAILED`, per-employee payslip-ready notifications.
- Salary setup post-activation only; payslips restricted to owner + HR/Admin (tested).
- Web: `/hr/payroll`, `/hr/payroll/run`, `/hr/payroll/batches/:id` (live progress), `/payroll` + payslip breakdown, salary form on employee detail.
- Hardening found by tests: queue failures mark batch `FAILED` instead of crashing; global 500 error boundary; BullMQ error listener.
- Tests: payroll 3/3, core math 3/3, serial suite 22/22.

## Phase 6 — Recruitment and URL shortener: DONE (2026-10-10)

- Migrations `010_catalog_jobs` (jobs, short_urls, candidate claims, application index, status tokens, candidate routing-map domain) + `011_candidate_shards` (candidates, applications, stage history, interviews, assessments, candidate_outbox).
- Candidate routing by `candidate_id` through a separate active `candidate` map pinned to shards 1–3; fenced candidate writes; candidate-outbox `AUDIT` events projected by the dispatcher (full audit atomicity on candidate shards deferred, noted).
- Jobs CRUD + public list/detail; application intake with resume validation (5 MB, PDF/Word + magic bytes, random S3 keys); duplicate-application guard; high-entropy revocable status tokens with minimal summaries.
- Stage machine with transition + version guards, interview/assessment records, idempotent SELECTED→invitation conversion.
- Short links: Base62 codes with collision retry, `/jobs` allow-list, Redis cache, click counts, rate-limited redirect; off-allow-list rejected (tested).
- Web: pipeline dashboard, job postings + short-link display, applications + detail stepper, candidate pool + detail, public `/jobs`, `/jobs/:slug`, apply form, status tracker.
- Tests: recruitment 2/2, serial suite 24/24.

## Phases 7–11: NOT STARTED

## Migration rule

Files in `infrastructure/postgres/migrations/` are named `NNN_name.sql` with one global increasing sequence (`001`, `002`, …). A file that has been executed is immutable: any change, however small, goes in a new `NNN` file. The runner records versions in `schema_migrations` and is idempotent.
