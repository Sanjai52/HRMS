import { Redis } from "ioredis";

let client: Redis | null = null;

export function redisKv(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_KV_URL ?? "redis://localhost:6380", {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
  }
  return client;
}
