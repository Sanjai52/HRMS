import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const API = __ENV.API ?? "http://localhost:4000";

// Custom counter: k6 v2 summary data omits tagged http_reqs submetrics
// (e.g. http_reqs{status:429}), so 429s are counted explicitly.
const rejected429 = new Counter("rejected_429");

export const options = {
  // Threshold doubles as submetric materialization: k6 v2 only exposes
  // tagged http_req_duration submetrics in summary data when a threshold
  // references them (without it, handleSummary crashes on undefined).
  thresholds: {
    "http_req_duration{op:login}": ["p(95)<10000"],
  },
  scenarios: {
    overload: {
      executor: "constant-arrival-rate",
      rate: 40,
      timeUnit: "1s",
      duration: "60s",
      preAllocatedVUs: 20,
      maxVUs: 40,
    },
  },
};

export default function () {
  const r = http.post(`${API}/api/v1/auth/login`, JSON.stringify({ email: "nobody@hrms.local", password: "wrongwrongwrong" }), {
    headers: { "Content-Type": "application/json" },
    tags: { op: "login" },
  });
  check(r, { limited_or_denied: (x) => [401, 429].includes(x.status) });
  if (r.status === 429) rejected429.add(1);
}

export function handleSummary(data) {
  const m = data.metrics;
  const d = m["http_req_duration{op:login}"] ?? m.http_req_duration;
  const total = Math.round(m.http_reqs.values.count);
  const limited = Math.round(m.rejected_429.values.count);
  return {
    stdout: JSON.stringify(
      {
        scenario: "login-overload-protection",
        http_reqs: total,
        rejected_429: limited,
        rejection_rate: total > 0 ? Math.round((limited / total) * 1000) / 1000 : 0,
        p50: Math.round(d.values.med),
        p95: Math.round(d.values["p(95)"]),
        note: "401 = rejected credentials, 429 = rate limited; both prove the endpoint held",
      },
      null,
      1
    ),
  };
}
