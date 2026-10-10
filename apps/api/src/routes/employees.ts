import { Router } from "express";
import { catalogPool } from "../db/pools.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";
import { searchLimit } from "../middleware/rate-limit.js";

export const employeesRouter = Router();

employeesRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const u = await catalogPool.query("SELECT email_norm FROM users WHERE user_id = $1", [req.userId]);
  if (u.rows.length === 0) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Account not found" } });
    return;
  }
  const d = await catalogPool.query("SELECT employee_id, name, email, department, designation, status FROM employee_directory WHERE email_norm = $1", [
    u.rows[0].email_norm,
  ]);
  res.json({ success: true, data: d.rows[0] ?? null });
});

employeesRouter.get("/", requireAuth, requireRoles("HR", "ADMIN", "MANAGER"), searchLimit, async (req, res) => {
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
