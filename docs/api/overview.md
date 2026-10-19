# API Overview (v1)

Base path `/api/v1` (health, metrics and the env-gated test helpers are unversioned). Every
response carries `x-request-id`; every API replica also sets `x-api-instance` to its `API_PORT`,
which makes NGINX load balancing observable. CORS allows `WEB_ORIGIN` (default
`http://localhost:3000`) with credentials; JSON bodies; `TRUST_PROXY` (default `172.16.0.0/12`)
is the only network allowed to set `X-Forwarded-For` (`apps/api/src/index.ts:29-40`).

## Envelopes

- Success: `{ "success": true, "data": ... }`. Scatter-gather reads add
  `"meta": { "partial": true, "unavailable": ["shard-2"] }` when some shards did not answer
  (see scenario I in `docs/evaluation.md`).
- Error: `{ "success": false, "error": { "code", "message", "details"? } }`
  (`packages/core/src/errors.ts`). Codes include `VALIDATION_ERROR`, `FORBIDDEN`,
  `INVITATION_EXPIRED`, `STATUS_EXPIRED`, `DEPENDENCY_UNAVAILABLE`, `GATE_CLOSED`,
  `QUEUE_UNAVAILABLE`, `LIMITER_UNAVAILABLE`.

## Route groups

| Group | Base | Access (RBAC) | Limiter scope | Notes |
|---|---|---|---|---|
| auth | `/auth` | public: `login`, `refresh`, `logout`, `accept`, `forgot-password`, `reset-password`; `HR`/`ADMIN`: invitations | `login`, `accept`, `recover` | access + refresh JWTs; refresh rotation with reuse detection; invitation 7 d, reset 30 min single-use (D-011, D-018) |
| employees | `/employees` | `HR`/`ADMIN` writes; `MANAGER` team reads; employee `self` | — | versioned writes (optimistic concurrency); `onboard` from invitation; `team` is the manager scatter-gather view |
| attendance | `/attendance` | employee self (`check-in`, `check-out`, `me`); `HR`/`ADMIN` corrections | — | duplicate check-in returns the original row (`duplicate: true`) |
| leave | `/leave` | employee apply/cancel; `MANAGER` team approve/reject; `HR`/`ADMIN` override + policies | — | no manager → straight to HR; override requires a reason |
| payroll | `/payroll` | `HR`/`ADMIN` structures + batches; employee own payslips | — | paise integers; percents 0–100; demo seed uses PF 12 / tax 10 (D-016); publish is idempotent by `UNIQUE(employee_id, period)` |
| jobs | `/jobs` | public list/board (`jobs` scope); `HR`/`ADMIN` CRUD | `jobs` | public job board also powers the candidate portal |
| recruitment | `/recruitment` | `HR`/`ADMIN` pipeline; public `apply` | `apply` | resume upload ≤ 5 MiB (D-012); candidate status link 30 d (D-010) |
| sourcing | `/recruitment/sourcing` | `HR`/`ADMIN` | `crawl` | crawl jobs executed by the worker; allow-listed destinations |
| reports | `/reports` | `HR`/`ADMIN`; manager team views | — | scatter-gather with `meta.partial` on shard outage |
| performance | `/performance` | `HR`/`ADMIN` cycles; employee goals/self-review; manager team reviews | — | review cycle state machine |
| notifications | `/notifications` | authenticated (own rows) | — | unread/read state per employee |
| search | `/search` | authenticated; `suggest` open-fail scope | `search`, `suggest` | autocomplete K/prefix/TTL/ranking per D-009 |
| short links | `/s/:code` on `/api/v1` | public | `short` | resolves to the long destination; allow-list enforced |
| admin | `/admin` | `ADMIN` only | — | audit logs, directory rebuild, shard list/preview/migrate/runs, settings |
| system (test) | `/system/test/*` | env-gated: `ALLOW_TEST_LIMITER_RESET=true` | — | `reset-limiter`, `run-dispatcher`; never enabled in production |
| health | `/health`, `/system/map-version` | public | — | liveness + active map version readback |
| metrics | `/metrics` | `METRICS_TOKEN` (header `x-metrics-token`) or internal peer IP | — | 403 otherwise; blocked at the NGINX ingress |

Every group above goes through `ShardRouter` for shard-owned rows — direct pool access is
banned outside the documented exceptions (D-007, D-020; `scripts/check-direct-pool-access.sh`).

## Rate-limit scopes

Source `apps/api/src/middleware/rate-limit.ts`; full table with failure modes in D-019. Summary:
`login` 30/60 s closed → `accept` 10/60 s closed → `recover` 10/60 s closed; `search` 60/60 s open,
`suggest` 120/60 s open, `jobs` 60/60 s open, `crawl` 6/60 s open; `apply` 10/60 s closed,
`short` 60/60 s closed. "Closed" means a limiter/KV outage fails the request (503
`LIMITER_UNAVAILABLE`); "open" means it is allowed through. Exceeded limits → 429 with the error
envelope. `RATE_LIMIT_BYPASS_IPS` is honored only outside production (test load runs).

## Operational endpoints

- `GET /health` — liveness + dependency summary (catalog/shard/queue/KV checks).
- `GET /system/map-version` — the routing map version the API process has loaded.
- `GET /metrics` — Prometheus text; per-route histograms tagged by `op`, plus
  `rate_limit_allowed_total` / `rate_limit_rejected_total` by scope.
- Worker: `GET /metrics` on `:4001`.

Scenario-by-scenario behavior under outage (queue, KV, catalog, shard, API kill, migrations)
is tabulated in `docs/evaluation.md`; the recorded raws are under `docs/experiments/raw/`.
