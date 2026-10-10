import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { employeesRouter } from "./routes/employees.js";
import { attendanceRouter } from "./routes/attendance.js";
import { leaveRouter } from "./routes/leave.js";
import { payrollRouter } from "./routes/payroll.js";
import { jobsRouter, shortRouter, publicRouter } from "./routes/jobs.js";
import { applicationsRouter } from "./routes/applications.js";
import { notificationsRouter } from "./routes/notifications.js";
import { healthRouter } from "./routes/health.js";
import { adminRouter } from "./routes/admin.js";
import { systemRouter } from "./routes/system.js";
import { searchRouter } from "./routes/search.js";
import { initIds } from "./ids.js";
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
app.use("/api/v1", shortRouter);
app.use(publicRouter);
app.use("/api/v1/notifications", notificationsRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/search", searchRouter);
app.use(systemRouter);
app.use(healthRouter);
app.use(metricsRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("unhandled route error:", (err as Error).message);
  res.status(500).json({ success: false, error: { code: "INTERNAL", message: "Something went wrong" } });
});

const port = Number(process.env.API_PORT ?? 4000);
initIds(`api:${port}:${process.pid}`).catch((e) => {
  console.error("worker-id lease unavailable at startup:", (e as Error).message);
});
app.listen(port, () => {
  console.log(`api listening on :${port}`);
});
