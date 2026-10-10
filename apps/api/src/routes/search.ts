import { Router } from "express";
import { normalizePrefix, suggestKey, parseSuggestMember, AUTOCOMPLETE_TOP_K } from "@hrms/core";
import { catalogPool } from "../db/pools.js";
import { redisKv } from "../db/redis.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { searchLimit } from "../middleware/rate-limit.js";

export const searchRouter = Router();

searchRouter.get(
  "/suggest",
  requireAuth,
  requireRoles("HR", "ADMIN", "MANAGER"),
  searchLimit,
  async (req, res) => {
    const q = normalizePrefix(typeof req.query.q === "string" ? req.query.q : "");
    const limit = Math.min(Number(req.query.limit ?? 8), AUTOCOMPLETE_TOP_K);
    if (!q) {
      res.json({ success: true, data: [] });
      return;
    }
    try {
      const members = await redisKv().zrevrange(suggestKey(q), 0, limit - 1);
      if (members.length > 0) {
        res.json({ success: true, data: members.map(parseSuggestMember), meta: { source: "cache" } });
        return;
      }
    } catch {
      // fall through to authoritative catalog query
    }
    const rows = await catalogPool.query(
      "SELECT employee_id, name, department FROM employee_directory WHERE name ILIKE $1 OR email_norm LIKE $2 ORDER BY name LIMIT $3",
      [`${q}%`, `${q}%`, limit]
    );
    if (rows.rows.length === 0) {
      res.json({ success: true, data: [], meta: { source: "catalog" } });
      return;
    }
    res.json({
      success: true,
      data: rows.rows.map((r) => ({
        employeeId: r.employee_id,
        name: r.name as string,
        department: (r.department as string) ?? "",
      })),
      meta: { source: "catalog" },
    });
  }
);
