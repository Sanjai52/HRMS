# HRMS — Scalable Human Resource Management System

UCS3513 System Design Laboratory, Mini Project 6. Enterprise HR workflows on an
explicitly sharded platform.

**Status: complete and verified.** Every PRD v2.5 phase (1a–10) is implemented; the optional
AWS phase (11) is deferred by design. The PRD §34 acceptance walk covers all 88 items with
per-item evidence in [docs/evaluation.md](docs/evaluation.md), and the post-PRD compliance
report — functional requirements, the eight system-design components, infrastructure and
measured results — is [docs/report.md](docs/report.md).

Documentation map: [PRD.md](PRD.md) · [docs/report.md](docs/report.md) ·
[docs/status.md](docs/status.md) (phase tracker) · [docs/decisions.md](docs/decisions.md)
(D-001–D-020) · [docs/evaluation.md](docs/evaluation.md) (measured results + §34 walk) ·
[docs/api/overview.md](docs/api/overview.md) (routes, RBAC, limiter scopes) ·
[docs/shard-owned-tables.md](docs/shard-owned-tables.md) (table-ownership manifest) ·
[docs/experiments/00-method.md](docs/experiments/00-method.md) (measurement method) ·
[docs/design-system.md](docs/design-system.md) (UI rules).

## Quick start

Requirements: Node ≥ 22, Docker Desktop. All data lives in local containers; login with
`hr@hrms.local` / `ChangeMe123!` (seeded, local-only). Ports 5438–5442 dodge the stock
Windows Postgres on 5432.

```bash
cp .env.example .env
docker compose up -d                      # core set: DBs, redis, mailpit, s3, portal, nginx
set -a && . ./.env && set +a              # export DB/redis URLs for the local scripts

node infrastructure/postgres/runner.mjs   # migrations (NNN_name.sql, immutable once run)
NODE_PATH=apps/api/node_modules node infrastructure/postgres/seed.cjs       # routing maps + HR user
NODE_PATH=apps/api/node_modules node infrastructure/postgres/seed-demo.cjs  # demo people + data

npm --workspace @hrms/api run dev         # API :4000
npm --workspace @hrms/worker run dev      # worker + metrics :4001
npm --workspace @hrms/web run dev         # web :3000
```

The candidate portal runs in compose (`:4100`); its crawler jobs are executed by the worker.
`npm --workspace @hrms/candidate-portal run dev` runs it on the host instead.

## Compose profiles and the load-test path (§17.3)

- **Default (`docker compose up -d`)** — the core stack: `pg-catalog` + `shard-1..4`,
  `redis-queue` (6379), `redis-kv` (6380), `s3` (moto, :5000), `mailpit` (:8025 UI, SMTP :1025),
  `candidate-portal` (:4100), `nginx` (:8080).
- **`docker compose --profile observability up -d`** — adds the monitoring set: exporters
  (postgres :9101–:9105, redis :9121/:9122, cadvisor :8081), Prometheus (:9090) and
  Grafana (:3001).

| Surface | URL |
|---|---|
| Web app | http://localhost:3000 |
| API (direct) | http://localhost:4000 (`/health`, `/metrics`) |
| NGINX (all API replicas) | http://localhost:8080 |
| Candidate portal | http://localhost:4100 |
| Mailpit | http://localhost:8025 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (admin/admin) |
| Worker metrics | http://localhost:4001/metrics |

- **Load-test path** — k6 runs on the host against the ingress: see `tests/load/` below.
  Compose does not embed the load generator. `smoke.js` is the sanity gate; `mixed.js`
  (`PROFILE=low|medium|high` → 10/30/60 rps), `burst.js` (9 AM check-in burst) and
  `ratelimit.js` produce the evaluation raws.

## API replicas behind NGINX

The API listens on `API_PORT` (default 4000) and echoes its port as the `x-api-instance`
response header, so load balancing is observable.

```bash
API_PORT=4002 npm --workspace @hrms/api run dev   # replica 2
API_PORT=4003 npm --workspace @hrms/api run dev   # replica 3
docker compose up -d nginx                        # entry point http://localhost:8080
for i in {1..6}; do curl -sD- -o /dev/null localhost:8080/health | grep -i x-api-instance; done
```

NGINX round-robins the three replicas (round-robin is the baseline; add a `least_conn;`
line to the `upstream` block in `infrastructure/nginx/nginx.conf` to benchmark the
alternative) with passive failure handling (`max_fails=2 fail_timeout=10s`): requests are
retried on the next server and an unhealthy replica is ejected for 10 s. Prometheus scrapes
each replica directly — `/metrics` is blocked at the ingress and restricted to internal
peers by the API itself.

`TRUST_PROXY` (default `172.16.0.0/12`, the Docker bridge subnet) is the only network
allowed to set `X-Forwarded-For`; it accepts comma-separated IPs, CIDRs or hop counts and
any other value fails startup. Set it in production to the actual proxy subnet so the rate
limiter can never be spoofed by a client.

## Layout

- `apps/web` — Next.js App Router, Tailwind v4, design tokens (port 3000)
- `apps/api` — Express modular monolith behind the shared `ShardRouter` (port 4000)
- `apps/worker` — BullMQ consumers, dispatcher loop, crawler, payroll chunks (metrics :4001)
- `apps/candidate-portal` — public candidate pages (compose :4100)
- `packages/core` — bucket hash, consistent-hash ring, router, fenced writes, registry logic
- `infrastructure/postgres` — versioned migrations (`NNN_name.sql`, immutable once run) + runner + seeds
- `infrastructure/nginx`, `infrastructure/monitoring` — ingress + alert rules
- `tests/load`, `tests/bench` — k6 scripts and Node benchmarks
- `docs/` — PRD, decisions, design system, status tracker, evaluation, API overview, experiments

## Verify

```bash
npm run ci                                   # typecheck + lint + ownership/pool guards + workspace tests
bash scripts/check-direct-pool-access.sh     # direct shard-pool access ban (D-007)
node scripts/check-shard-owned-tables.mjs    # migration ownership declarations (NFR-MIG-03)

set -a && . ./.env && set +a
MAIL_LIVE=1 npm --workspace @hrms/api run test             # serial API suite (stack up)
npm --workspace @hrms/web run build
npm --workspace @hrms/web run e2e                          # Playwright suite

k6 run -e API=http://localhost:8080 tests/load/smoke.js
k6 run -e API=http://localhost:8080 -e PROFILE=medium tests/load/mixed.js
k6 run -e API=http://localhost:8080 tests/load/burst.js
```

Last verified (2026-10-19, full stack up): `npm run ci` exit 0 — typecheck 5/5
workspaces, lint, `pool-access-ok`, `shard-owned-tables-ok (16/16)`, API **24 files / 73
passed | 1 skipped**, core **13 files / 40 passed | 4 skipped**; Playwright e2e **14/14**;
k6 smoke **121/121 checks, 0% failed** (3 API replicas + worker + web behind NGINX).

Scenario evidence (queue/KV/catalog/shard outages, API kill, migrations) lives in
`docs/experiments/raw/scenario-*.txt` and is tabulated in
[docs/evaluation.md](docs/evaluation.md); the route-group map with RBAC and limiter scopes
is in [docs/api/overview.md](docs/api/overview.md).
