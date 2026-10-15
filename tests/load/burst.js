import http from "k6/http";
import { check } from "k6";

const API = __ENV.API ?? "http://localhost:4000";

export const options = {
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: {
    burst: {
      executor: "ramping-arrival-rate",
      startRate: 5,
      timeUnit: "1s",
      preAllocatedVUs: 100,
      maxVUs: 200,
      stages: [
        { duration: "20s", target: 5 },
        { duration: "30s", target: 120 },
        { duration: "30s", target: 10 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.15"],
    "http_req_duration{op:checkin}": ["p(95)<3000", "p(99)<6000"],
  },
};

export function setup() {
  const res = http.post(`${API}/api/v1/auth/login`, JSON.stringify({ email: "hr@hrms.local", password: "ChangeMe123!" }), {
    headers: { "Content-Type": "application/json" },
  });
  check(res, { login: (r) => r.status === 200 });
  return { token: res.json().data.token };
}

export default function (data) {
  const r = http.post(`${API}/api/v1/attendance/check-in`, null, {
    headers: { Authorization: `Bearer ${data.token}` },
    tags: { op: "checkin" },
  });
  check(r, { ok: (x) => [200, 201].includes(x.status) });
}

export function handleSummary(data) {
  const m = data.metrics;
  return {
    stdout: JSON.stringify(
      {
        scenario: "9am-checkin-burst",
        http_reqs: Math.round(m.http_reqs.values.count),
        failed: m.http_req_failed.values.rate,
        checkin_p50: Math.round(m["http_req_duration{op:checkin}"]?.values.med ?? 0),
        checkin_p95: Math.round(m["http_req_duration{op:checkin}"]?.values["p(95)"] ?? 0),
        checkin_p99: Math.round(m["http_req_duration{op:checkin}"]?.values["p(99)"] ?? 0),
      },
      null,
      1
    ),
  };
}
