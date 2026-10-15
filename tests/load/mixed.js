import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";

const API = __ENV.API ?? "http://localhost:4000";
const PROFILE = __ENV.PROFILE ?? "low";

const RATES = { low: 10, medium: 30, high: 60 };
const DUR = { low: "2m", medium: "3m", high: "5m" };

export const options = {
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: {
    mixed: {
      executor: "ramping-arrival-rate",
      startRate: 2,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 120,
      stages: [
        { duration: "30s", target: RATES[PROFILE] },
        { duration: DUR[PROFILE], target: RATES[PROFILE] },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<2000", "p(99)<4000"],
    "http_req_duration{op:search}": ["p(95)<2000", "p(99)<4000"],
    "http_req_duration{op:suggest}": ["p(95)<2000", "p(99)<4000"],
    "http_req_duration{op:attendance}": ["p(95)<2000", "p(99)<4000"],
    "http_req_duration{op:leave}": ["p(95)<2000", "p(99)<4000"],
    "http_req_duration{op:login}": ["p(95)<5000", "p(99)<10000"],
    "http_req_duration{op:health}": ["p(95)<1000", "p(99)<2000"],
  },
};

export function setup() {
  const res = http.post(`${API}/api/v1/auth/login`, JSON.stringify({ email: "hr@hrms.local", password: "ChangeMe123!" }), {
    headers: { "Content-Type": "application/json" },
  });
  check(res, { login: (r) => r.status === 200 });
  return { token: res.json().data.token };
}

const SEARCHES = ["aarav", "engineer", "priya", "hr", "design", "sales", "ananya", "ka"];

export default function (data) {
  const h = { Authorization: `Bearer ${data.token}` };
  const roll = Math.random();
  let r;
  if (roll < 0.35) {
    const q = SEARCHES[Math.floor(Math.random() * SEARCHES.length)];
    r = http.get(`${API}/api/v1/employees?q=${q}&limit=20`, { headers: h, tags: { op: "search" } });
    check(r, { ok: (x) => x.status === 200 });
  } else if (roll < 0.55) {
    const q = SEARCHES[Math.floor(Math.random() * SEARCHES.length)].slice(0, 3);
    r = http.get(`${API}/api/v1/search/suggest?q=${q}`, { headers: h, tags: { op: "suggest" } });
    check(r, { ok: (x) => x.status === 200 });
  } else if (roll < 0.7) {
    r = http.get(`${API}/api/v1/attendance/me`, { headers: h, tags: { op: "attendance" } });
    check(r, { ok: (x) => x.status === 200 });
  } else if (roll < 0.8) {
    r = http.get(`${API}/api/v1/leave/balances`, { headers: h, tags: { op: "leave" } });
    check(r, { ok: (x) => [200, 404].includes(x.status) });
  } else if (roll < 0.85) {
    r = http.post(`${API}/api/v1/auth/login`, JSON.stringify({ email: "hr@hrms.local", password: "ChangeMe123!" }), {
      headers: { "Content-Type": "application/json" },
      tags: { op: "login" },
    });
    check(r, { ok: (x) => x.status === 200 });
  } else {
    r = http.get(`${API}/health`, { tags: { op: "health" } });
    check(r, { ok: (x) => x.status === 200 });
  }
  sleep(0.2);
}

export function handleSummary(data) {
  return { stdout: JSON.stringify(summary(data), null, 1) };
}

function pct(v, p) {
  const vs = [...v].sort((a, b) => a - b);
  return vs[Math.min(vs.length - 1, Math.floor((p / 100) * vs.length))];
}

function summary(data) {
  const m = data.metrics;
  const out = { profile: PROFILE, ops: {} };
  for (const [name, metric] of Object.entries(m)) {
    if (name.startsWith("http_req_duration{op:")) {
      const op = name.match(/op:(\w+)/)?.[1] ?? name;
      out.ops[op] = { count: metric.values.count, p50: Math.round(metric.values.med), p95: Math.round(metric.values["p(95)"]), p99: Math.round(metric.values["p(99)"]) };
    }
  }
  out.http_req_duration = { p50: Math.round(m.http_req_duration.values.med), p95: Math.round(m.http_req_duration.values["p(95)"]), p99: Math.round(m.http_req_duration.values["p(99)"]) };
  out.http_reqs = Math.round(m.http_reqs.values.count);
  out.http_req_failed = m.http_req_failed.values.rate;
  void pct;
  void exec;
  return out;
}
