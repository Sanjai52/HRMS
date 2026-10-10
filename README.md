# HRMS — Scalable Human Resource Management System

UCS3513 System Design Laboratory, Mini Project 6. Enterprise HR workflows on an
explicitly sharded platform. See [PRD.md](PRD.md), [docs/status.md](docs/status.md)
for the phase tracker, and [docs/design-system.md](docs/design-system.md) for UI rules.

## Quick start (local-only, Phase 1a)

```bash
cp .env.example .env
docker compose up -d
CATALOG_DATABASE_URL=postgres://hrms:hrms@localhost:5438/hrms_catalog \
DATABASE_SHARD_1_URL=postgres://hrms:hrms@localhost:5439/hrms_shard1 \
DATABASE_SHARD_2_URL=postgres://hrms:hrms@localhost:5440/hrms_shard2 \
DATABASE_SHARD_3_URL=postgres://hrms:hrms@localhost:5441/hrms_shard3 \
DATABASE_SHARD_4_URL=postgres://hrms:hrms@localhost:5442/hrms_shard4 \
node infrastructure/postgres/runner.mjs
# seed routing map + demo data
CATALOG_DATABASE_URL=... DATABASE_SHARD_1_URL=... ... \
NODE_PATH=apps/api/node_modules node infrastructure/postgres/seed.cjs
npm --workspace @hrms/api run dev   # :4000
npm --workspace @hrms/web run dev    # :3000
```

Ports 5438–5442 dodge the stock Windows Postgres on 5432. Login with
`hr@hrms.local` / `ChangeMe123!` (seeded, local-only).

## Layout

- `apps/web` — Next.js App Router, Tailwind v4, Airbnb design tokens
- `apps/api` — Express modular monolith behind shared `ShardRouter`
- `apps/worker`, `apps/candidate-portal` — Phase 1b/7 stubs
- `packages/core` — bucket hash, consistent-hash ring, router, fenced writes
- `infrastructure/postgres` — versioned migrations (`NNN_name.sql`, immutable once run) + runner + seed
- `docs/` — PRD, decisions, design system, status tracker, experiments (later)

## Verify

```bash
npm --workspace @hrms/core test -- --run
CATALOG_DATABASE_URL=... DATABASE_SHARD_1_URL=... ... API_BASE=http://localhost:4000 \
npm --workspace @hrms/api test -- --run
npm --workspace @hrms/web run build
bash scripts/check-direct-pool-access.sh
```
