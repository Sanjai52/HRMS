import type { Request, Response, NextFunction } from "express";
import { errorEnvelope } from "@hrms/core";
import { verifyAccessToken } from "../auth/token.js";

export interface AuthedRequest extends Request {
  userId?: string;
  roles?: string[];
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json(errorEnvelope("UNAUTHENTICATED", "Missing bearer token"));
    return;
  }
  try {
    const { userId, roles } = verifyAccessToken(header.slice(7));
    req.userId = userId;
    req.roles = roles;
    next();
  } catch {
    res.status(401).json(errorEnvelope("UNAUTHENTICATED", "Invalid or expired token"));
  }
}

export function requireRoles(...allowed: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const roles = req.roles ?? [];
    if (!allowed.some((r) => roles.includes(r))) {
      res.status(403).json(errorEnvelope("FORBIDDEN", "Insufficient role"));
      return;
    }
    next();
  };
}
