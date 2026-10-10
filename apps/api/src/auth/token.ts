import jwt from "jsonwebtoken";

const TTL_SECONDS = 600;

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("missing-env:JWT_SECRET");
  return s;
}

export function signAccessToken(payload: { userId: string; roles: string[] }): { token: string; expiresIn: number } {
  const token = jwt.sign({ sub: payload.userId, roles: payload.roles }, secret(), { expiresIn: TTL_SECONDS });
  return { token, expiresIn: TTL_SECONDS };
}

export function verifyAccessToken(token: string): { userId: string; roles: string[] } {
  const decoded = jwt.verify(token, secret()) as { sub: string; roles: string[] };
  return { userId: decoded.sub, roles: decoded.roles ?? [] };
}
