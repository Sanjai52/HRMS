import "dotenv/config";
import { createRequire } from "node:module";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { errorEnvelope } from "@hrms/core";
import { authRouter } from "./routes/auth.js";
import { employeesRouter } from "./routes/employees.js";
import { attendanceRouter } from "./routes/attendance.js";
import { leaveRouter } from "./routes/leave.js";
import { payrollRouter } from "./routes/payroll.js";
import { jobsRouter, shortRouter, publicRouter } from "./routes/jobs.js";
import { applicationsRouter } from "./routes/applications.js";
import { reportsRouter } from "./routes/reports.js";
import { performanceRouter } from "./routes/performance.js";
import { sourcingRouter } from "./routes/sourcing.js";
import { notificationsRouter } from "./routes/notifications.js";
import { healthRouter } from "./routes/health.js";
import { adminRouter } from "./routes/admin.js";
import { systemRouter } from "./routes/system.js";
import { searchRouter } from "./routes/search.js";
import { initIds } from "./ids.js";
import { registerProcess } from "./registry.js";
import { metricsMiddleware, metricsRouter } from "./routes/metrics.js";

const app = express();
app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(metricsMiddleware);
app.use((req, res, next) => {
  res.setHeader("x-request-id", `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  next();
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/employees", employeesRouter);
app.use("/api/v1/attendance", attendanceRouter);
app.use("/api/v1/leave", leaveRouter);
app.use("/api/v1/payroll", payrollRouter);
app.use("/api/v1/jobs", jobsRouter);
app.use("/api/v1/recruitment", applicationsRouter);
app.use("/api/v1/reports", reportsRouter);
app.use("/api/v1/performance", performanceRouter);
app.use("/api/v1/recruitment/sourcing", sourcingRouter);
app.use("/api/v1", shortRouter);
app.use(publicRouter);
app.use("/api/v1/notifications", notificationsRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/search", searchRouter);
app.use(systemRouter);
app.use(healthRouter);
app.use(metricsRouter);

// Map backend-availability failures to a retryable 503 instead of a bare 500.
// pg surfaces these as Node socket errors (gateway/shard down) or SQLSTATEs
// (57P01 admin shutdown, 57014 statement cancelled by the pool query timeout).
function dependencyUnavailable(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  if (["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "57P01", "57014"].includes(code)) return true;
  const message = typeof e?.message === "string" ? e.message : "";
  return message.includes("Connection terminated");
}

// Express 4 forwards only synchronous throws to error middleware; a rejected
// promise from an async route handler would otherwise kill the process as an
// unhandled rejection (Node >=15) before any error handler runs. Patch the
// dispatch path so async rejections reach the handler below — the same shim as
// the express-async-errors package, kept local to avoid a new dependency.
type DispatchLayer = { handle: ((...args: unknown[]) => unknown) & { length: number } };
const require = createRequire(import.meta.url);
const Layer = require("express/lib/router/layer.js") as {
  prototype: { handle_request(this: DispatchLayer, req: unknown, res: unknown, next: (err?: unknown) => void): void };
};
Layer.prototype.handle_request = function handleRequestPatched(this: DispatchLayer, req: unknown, res: unknown, next: (err?: unknown) => void): void {
  const fn = this.handle;
  if (fn.length > 3) {
    next();
    return;
  }
  try {
    const result = fn(req, res, next);
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      Promise.resolve(result).catch(next);
    }
  } catch (err) {
    next(err);
  }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("unhandled route error:", (err as Error).message);
  if (dependencyUnavailable(err)) {
    res.status(503).json(errorEnvelope("DEPENDENCY_UNAVAILABLE", "A backend dependency is unavailable; retry shortly"));
    return;
  }
  res.status(500).json({ success: false, error: { code: "INTERNAL", message: "Something went wrong" } });
});

const port = Number(process.env.API_PORT ?? 4000);
initIds(`api:${port}:${process.pid}`).catch((e) => {
  console.error("worker-id lease unavailable at startup:", (e as Error).message);
});
registerProcess("API", `api:${port}:${process.pid}`).catch((e) => {
  console.error("process registry unavailable at startup:", (e as Error).message);
});
app.listen(port, () => {
  console.log(`api listening on :${port}`);
});
