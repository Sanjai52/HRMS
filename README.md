# HRMS — Scalable Human Resource Management System

Enterprise HR workflows on an explicitly sharded platform. This repository contains the
backend API, BullMQ worker, web application, candidate portal, infrastructure, tests, and
documentation for the HRMS mini-project.

**Status:** complete and verified. All PRD v2.5 phases (1a–10) are implemented. The optional
AWS phase (11) is intentionally deferred. See [docs/operations/report.md](docs/operations/report.md)
and [docs/operations/evaluation.md](docs/operations/evaluation.md) for implementation and measured
results.

## Features

- Employee, manager, HR, and admin workflows
- Attendance, leave, payroll, performance, recruitment, sourcing, notifications, reports
- Explicit employee/candidate sharding with consistent hashing and migration support
- Redis-backed sessions, rate limiting, queues, and caching
- Candidate portal and crawler-driven sourcing
- Prometheus/Grafana observability stack
- Playwright and k6-based verification assets

## Tech stack

- Backend: Node.js, Express, TypeScript
- Frontend: Next.js, React, Tailwind CSS, Phosphor Icons
- Data: PostgreSQL, Redis
- Queue: BullMQ
- Infrastructure: Docker Compose, NGINX
- Testing: Vitest, k6, Playwright

## Prerequisites

- Node.js 22 or newer
- Docker Desktop
- npm (workspace-aware)

## Quick start

```bash
cp .env.example .env
docker compose up -d

set -a && . ./.env && set +a

node infrastructure/postgres/runner.mjs
NODE_PATH=apps/api/node_modules node infrastructure/postgres/seed.cjs
NODE_PATH=apps/api/node_modules node infrastructure/postgres/seed-demo.cjs

npm --workspace @hrms/api run dev
npm --workspace @hrms/worker run dev
npm --workspace @hrms/web run dev
```

The web app is available at `http://localhost:3000`, the API at `http://localhost:4000`, and
the candidate portal at `http://localhost:4100`.

## Observability

Start the monitoring profile when needed:

```bash
docker compose --profile observability up -d
```

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (`admin` / `admin`)

## Demo accounts (local only)

| Role | Email | Password |
|---|---|---|
| HR | hr@hrms.local | ChangeMe123! |
| Manager / employee self-service | ui.manager@hrms.local | Walkthrough123! |
| Admin | ui.admin@hrms.local | Walkthrough123! |
| Demo manager / employee self-service | aditi.demo21@hrms.local | ManagerPass1! |

Do not use these credentials outside local development.

## Useful commands

```bash
npm run typecheck
npm run lint
npm run test --workspaces --if-present
npm run check:pool-access
npm run check:shard-tables
npm run ci
```

## Documentation map

- [PRD](docs/product/PRD.md)
- [Project architecture](PROJECT_ARCHITECTURE.md)
- [Context](docs/architecture/context.md)
- [Architecture decisions](docs/architecture/decisions.md)
- [Design system](docs/architecture/design-system.md)
- [API overview](docs/api/overview.md)
- [Shard-owned tables](docs/architecture/shard-owned-tables.md)
- [Status tracker](docs/operations/status.md)
- [Post-PRD report](docs/operations/report.md)
- [Evaluation](docs/operations/evaluation.md)
- [UI content policy](docs/ui/ui-content-policy.md)
- [UI walkthrough](docs/ui/ui-walkthrough.md)
- [Experiments](docs/experiments/00-method.md)

## Project structure

```text
apps/
  api/        Express API
  web/        Next.js web application
  worker/     BullMQ worker
  candidate-portal/
packages/
  core/       Shared routing, ID, queue, and domain helpers
docs/
  product/    Product requirements
  architecture/
  operations/
  ui/
  reference/
infrastructure/
  postgres/   Migrations and seed scripts
  nginx/      Reverse proxy configuration
scripts/
tests/
```

## Notes

- All data lives in local Docker containers.
- Ports 5438–5442 are used to avoid conflicts with a stock Windows Postgres installation.
- `Reference/`, `.superpowers/`, and `.playwright-mcp/` are local-only artifacts and are not part of the committed application.

## License

No license has been specified for this repository yet.
