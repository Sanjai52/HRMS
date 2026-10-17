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

function userSessionsKey(userId: string): string {
  return `usersessions:${userId}`;
}

export function newCsrf(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<{ sessionId: string; csrf: string }> {
  const sessionId = sid();
  const csrf = newCsrf();
  const record: SessionRecord = { userId, csrf };
  await kv().set(`session:${sessionId}`, JSON.stringify(record), SESSION_TTL);
  // The revocable index has no KvStore operation, so it uses the raw client.
  await redisKv().sadd(userSessionsKey(userId), sessionId);
  await redisKv().expire(userSessionsKey(userId), SESSION_TTL);
  return { sessionId, csrf };
}

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  const raw = await kv().get(`session:${sessionId}`);
  return raw ? (JSON.parse(raw) as SessionRecord) : null;
}

export async function rotateSession(oldId: string): Promise<{ sessionId: string; csrf: string } | null> {
  const record = await getSession(oldId);
  if (!record) return null;
  await redisKv().srem(userSessionsKey(record.userId), oldId);
  await kv().del(`session:${oldId}`);
  return createSession(record.userId);
}

export async function destroySession(sessionId: string): Promise<void> {
  const record = await getSession(sessionId);
  if (record) await redisKv().srem(userSessionsKey(record.userId), sessionId);
  await kv().del(`session:${sessionId}`);
}

/** Revoke every session a user still holds (password reset, deactivation). */
export async function destroyUserSessions(userId: string): Promise<void> {
  const ids = await redisKv().smembers(userSessionsKey(userId));
  if (ids.length > 0) await Promise.all(ids.map((id) => kv().del(`session:${id}`)));
  await redisKv().del(userSessionsKey(userId));
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
