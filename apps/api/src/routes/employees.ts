import { Router } from "express";
import { catalogPool } from "../db/pools.js";
import { requireAuth } from "../middleware/auth.js";

export const employeesRouter = Router();

employeesRouter.get("/", requireAuth, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const rows = q
    ? await catalogPool.query(
        "SELECT employee_id, name, email, department, designation, status FROM employee_directory WHERE name ILIKE $1 OR email_norm LIKE $2 ORDER BY name LIMIT $3",
        [`%${q}%`, `%${q.toLowerCase()}%`, limit]
      )
    : await catalogPool.query(
        "SELECT employee_id, name, email, department, designation, status FROM employee_directory ORDER BY name LIMIT $1",
        [limit]
      );
  res.json({ success: true, data: rows.rows });
});
