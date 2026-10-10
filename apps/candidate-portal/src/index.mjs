import express from "express";

const app = express();
app.get("/", (_req, res) => res.send("candidate-portal stub: fixtures arrive in Phase 7"));
const port = Number(process.env.PORTAL_PORT ?? 4100);
app.listen(port, () => console.log(`candidate-portal stub on :${port}`));
