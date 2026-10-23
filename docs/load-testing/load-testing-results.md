# Load Testing Results

Date: 2026-10-22

## Environment

- Web server restarted cleanly on `http://localhost:3000`.
- API services remained running on ports `4000` and `5000`.
- Load tool: k6 `v2.2.0`.
- Data was not reset.

## Results

### Baseline smoke

Command: `k6 run tests/load/smoke.js`

- 2 VUs for 30 seconds
- 60 iterations / 121 HTTP requests
- Checks: 121/121 passed
- HTTP failures: 0%
- HTTP latency: p50 7 ms, p95 15.43 ms, p99 not reported by the script
- Thresholds: passed

### Mixed low profile

Command: `$env:PROFILE='low'; k6 run tests/load/mixed.js`

- Ramping arrival rate up to 10 iterations/second for 3 minutes
- 1,529 HTTP requests
- HTTP failures: 21.44%
- Overall latency: p50 5 ms, p95 66 ms, p99 113 ms
- Operation latency p95: search 9 ms, suggest 10 ms, attendance 10 ms, leave 6 ms, login 139 ms, health 13 ms
- Thresholds: failed because the HTTP failure rate exceeded the configured `<5%` limit

The mixed-profile failures were response-status failures, not latency failures. The repository’s mixed scenario includes repeated login requests and accepts a `404` for leave balances, so the next investigation should classify the failed response statuses before changing application code.

### Not run in this pass

- `tests/load/burst.js`
- `tests/load/ratelimit.js`

These scenarios were not run after the mixed test because the live UI shell investigation took priority. They remain available for a follow-up run.

## UI shell note

The reported right-side black strip was not reproduced inside the application. Playwright layout checks across shared-shell routes at 1440px and 390px found no gap: `main` reached the viewport edge and `body.scrollWidth` matched the viewport. The supplied image is wider than the captured app viewport; the red-boxed strip is outside the page viewport rather than an in-app shell column. Defensive `w-full` and `overflow-x-hidden` rules were added to the shared shell/body.
