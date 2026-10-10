# HRMS Build Status Tracker

Updated every time a phase (or sub-slice) lands. Measured results only; no invented numbers.

## Phase 1a — Walking skeleton: DONE (2026-10-10)

- Workspace (npm), `@hrms/core` (bucket SHA-256, ring V=128, ShardRouter, fenced writes), CI pool-access guard.
- Compose: `pg-catalog` :5438, shards :5439–:5442. Migrations `001_catalog_init`, `002_shard_init`. Routing map v1 seeded (97/78/81 buckets across shard-1/2/3).
- Seed: HR `hr@hrms.local` + 5 directory people via canonical routing; seed-routing test green.
- API: `POST /api/v1/auth/login` (Argon2id, 10-min JWT), `GET /api/v1/employees`, `/health`, `/system/map-version`. No Redis/refresh/rate-limit by design.
- Web (Airbnb DS, Tailwind v4): landing, login, shell sidebar+topbar, dashboard, directory, stubs.
- Tests: core 6/6, api 3/3 (gate, auth, seed-routing), web build green.

## Phase 1b — Remaining local infrastructure: NOT STARTED

Redis queue/KV, queue abstraction, NGINX, MinIO, Mailpit, Compose profiles, pool budgets, Prometheus/Grafana wiring.

## Phase 2 — Identity, RBAC, audit, rate limiting: NOT STARTED

## Phase 3 — Employee management, activation, directory: NOT STARTED (directory currently seed-populated, outbox pending)

## Phases 4–11: NOT STARTED

## Migration rule

Files in `infrastructure/postgres/migrations/` are named `NNN_name.sql` with one global increasing sequence (`001`, `002`, …). A file that has been executed is immutable: any change, however small, goes in a new `NNN` file. The runner records versions in `schema_migrations` and is idempotent.
