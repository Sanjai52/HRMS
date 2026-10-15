import http from "k6/http";
import { check, sleep } from "k6";

const API = __ENV.API ?? "http://localhost:4000";

export const options = {
  vus: 2,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<1500"],
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
  const h = { Authorization: `Bearer ${data.token}` };
  let r = http.get(`${API}/api/v1/employees?limit=20`, { headers: h });
  check(r, { directory: (x) => x.status === 200 });
  r = http.get(`${API}/api/v1/attendance/me`, { headers: h });
  check(r, { attendance: (x) => x.status === 200 });
  sleep(1);
}
