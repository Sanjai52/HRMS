import { createHash, randomBytes, randomUUID } from "node:crypto";
import { kv, redisKv } from "../db/redis.js";

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
  await kv().set(`session:${sessionId}`, JSON.stringify(record), SESSION_TTL);
  return { sessionId, csrf };
}

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  const raw = await kv().get(`session:${sessionId}`);
  return raw ? (JSON.parse(raw) as SessionRecord) : null;
}

export async function rotateSession(oldId: string): Promise<{ sessionId: string; csrf: string } | null> {
  const record = await getSession(oldId);
  if (!record) return null;
  await kv().del(`session:${oldId}`);
  return createSession(record.userId);
}

export async function destroySession(sessionId: string): Promise<void> {
  await kv().del(`session:${sessionId}`);
}

export async function destroyUserSessions(userId: string): Promise<void> {
  // Key scanning has no KvStore operation, so the raw client walks `session:*`
  // while the session values themselves go through kv().
  let cursor = "0";
  do {
    const [next, keys] = await redisKv().scan(cursor, "MATCH", "session:*", "COUNT", 200);
    cursor = next;
    for (const key of keys) {
      const raw = await kv().get(key);
      if (raw && (JSON.parse(raw) as SessionRecord).userId === userId) await kv().del(key);
    }
  } while (cursor !== "0");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
