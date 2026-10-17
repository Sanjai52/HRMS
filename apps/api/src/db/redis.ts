import { Redis } from "ioredis";
import { RedisKvStore, type KvStore } from "@hrms/core";

let client: Redis | null = null;
let store: KvStore | null = null;

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

/**
 * Shared KvStore for simple get/set/del users (sessions, short-link cache) and
 * the token-bucket limiter. Sorted-set, scan and counter users (autocomplete
 * indexing, `rl:*` resets, click counters, the dispatcher) keep the raw
 * `redisKv()` client.
 */
export function kv(): KvStore {
  if (!store) store = new RedisKvStore(redisKv());
  return store;
}
