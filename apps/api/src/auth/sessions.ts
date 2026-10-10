import { createHash, randomBytes, randomUUID } from "node:crypto";
import { redisKv } from "../db/redis.js";

const SESSION_TTL = 7 * 24 * 3600;

export interface SessionRecord {
  userId: string;
  csrf: string;
}

function sid(): string {
  return randomUUID();
}

export function newCsrf(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<{ sessionId: string; csrf: string }> {
  const sessionId = sid();
  const csrf = newCsrf();
  const record: SessionRecord = { userId, csrf };
  await redisKv().set(`session:${sessionId}`, JSON.stringify(record), "EX", SESSION_TTL);
  return { sessionId, csrf };
}

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  const raw = await redisKv().get(`session:${sessionId}`);
  return raw ? (JSON.parse(raw) as SessionRecord) : null;
}

export async function rotateSession(oldId: string): Promise<{ sessionId: string; csrf: string } | null> {
  const record = await getSession(oldId);
  if (!record) return null;
  await redisKv().del(`session:${oldId}`);
  return createSession(record.userId);
}

export async function destroySession(sessionId: string): Promise<void> {
  await redisKv().del(`session:${sessionId}`);
}

export async function destroyUserSessions(userId: string): Promise<void> {
  const redis = redisKv();
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "session:*", "COUNT", 200);
    cursor = next;
    for (const key of keys) {
      const raw = await redis.get(key);
      if (raw && (JSON.parse(raw) as SessionRecord).userId === userId) await redis.del(key);
    }
  } while (cursor !== "0");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
