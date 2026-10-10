import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { employeesRouter } from "./routes/employees.js";
import { healthRouter } from "./routes/health.js";
import { metricsMiddleware, metricsRouter } from "./routes/metrics.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);
app.use((req, res, next) => {
  res.setHeader("x-request-id", `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  next();
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/employees", employeesRouter);
app.use(healthRouter);
app.use(metricsRouter);

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port, () => {
  console.log(`api listening on :${port}`);
});
