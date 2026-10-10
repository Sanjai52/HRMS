import { Router } from "express";
import { errorEnvelope } from "@hrms/core";
import { catalogPool } from "../db/pools.js";
import { verifyPassword } from "../auth/password.js";
import { signAccessToken } from "../auth/token.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json(errorEnvelope("VALIDATION_ERROR", "Email and password are required"));
    return;
  }
  const norm = email.trim().toLowerCase();
  const u = await catalogPool.query("SELECT user_id, password_hash, status FROM users WHERE email_norm = $1", [norm]);
  if (u.rows.length === 0 || u.rows[0].status !== "ACTIVE") {
    res.status(401).json(errorEnvelope("INVALID_CREDENTIALS", "Invalid email or password"));
    return;
  }
  const ok = await verifyPassword(u.rows[0].password_hash as string, password);
  if (!ok) {
    res.status(401).json(errorEnvelope("INVALID_CREDENTIALS", "Invalid email or password"));
    return;
  }
  const r = await catalogPool.query("SELECT role FROM user_roles WHERE user_id = $1", [u.rows[0].user_id]);
  const roles = (r.rows as Array<{ role: string }>).map((row) => row.role);
  const { token, expiresIn } = signAccessToken({ userId: u.rows[0].user_id as string, roles });
  res.json({ success: true, data: { token, expiresIn, roles } });
});
