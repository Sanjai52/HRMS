import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { employeesRouter } from "./routes/employees.js";
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
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/search", searchRouter);
app.use(systemRouter);
app.use(healthRouter);
app.use(metricsRouter);

const port = Number(process.env.API_PORT ?? 4000);
initIds(`api:${port}:${process.pid}`).catch((e) => {
  console.error("worker-id lease unavailable at startup:", (e as Error).message);
});
app.listen(port, () => {
  console.log(`api listening on :${port}`);
});
