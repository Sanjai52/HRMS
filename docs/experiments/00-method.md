# Evaluation method (all runs)

- Runner: k6 v2.2.0 on the same laptop as the stack (numbers are comparative, not production claims).
- Stack during runs: 1 API replica (:4000), 1 worker, pg-catalog + 4 PG shards, redis-queue + redis-kv, Moto S3, Mailpit, NGINX idle. Prometheus scrapes :4000.
- Dataset: 190 directory people, ~826 attendance rows, 24 salary structures, 8 demo candidates; test traffic adds check-ins/leave/payroll/crawl rows as it runs (counts noted per run).
- Rate limiting: `RATE_LIMIT_BYPASS_IPS=127.0.0.1,::1` (test-only, default empty) for throughput runs so the limiter does not mask app behavior. The rate-limit run uses no bypass.
- Repetition: each workload runs 3 warmed times; tables show per-run p50/p95/p99 with median + range for p95/p99 (percentiles are never averaged).
- Resource notes: `docker stats` sampled before/after each run; host also runs the IDE and browser.
- Raw outputs: `docs/experiments/raw/`.
- k6 v2 note: default summaries compute p(90)/p(95) only and tagged `http_req_duration` submetrics appear in `handleSummary` data only when a threshold references them. Load scripts set `summaryTrendStats` to include p(99); `ratelimit.js` counts 429s with a custom `rejected_429` counter instead of `http_reqs{status:…}` submetrics.
- Bypass note (Oct 15 runs): the API process was left untouched (its launch env, incl. `JWT_SECRET`, is not recoverable from outside, so no restart). Burst needs no bypass (check-in route is unthrottled); `suggest-bench.mjs` paces via `GAP_MS=1100` (~0.9 req/s under the 60/min/user refill) instead of bypass; the ratelimit run used no bypass as required.
