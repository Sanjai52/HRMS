import { TokenBucket, type BucketResult } from "./rate-limit.js";

/**
 * Minimal Redis command surface required by `RedisKvStore`. A real ioredis
 * client structurally satisfies this; tests use an in-memory fake.
 */
export interface KvRedisClient {
  get(key: string): Promise<string | null>;
  // ioredis v6 declares dozens of `set` overloads; a rest signature accepts a
  // real client structurally. RedisKvStore only calls (key, value) and
  // (key, value, "EX", ttlSeconds).
  set(...args: unknown[]): Promise<unknown>;
  del(key: string): Promise<unknown>;
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

export interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  takeToken(key: string, capacity: number, windowMs: number): Promise<BucketResult>;
}

/**
 * KvStore backed by a Redis client. `takeToken` delegates to the existing
 * `TokenBucket` Lua implementation, so limiter counters keep the `rl:`
 * key prefix (and the same key shape) used before this adapter existed.
 */
export class RedisKvStore implements KvStore {
  private bucket: TokenBucket;

  constructor(private client: KvRedisClient, prefix = "rl") {
    this.bucket = new TokenBucket(client, prefix);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds === undefined) {
      await this.client.set(key, value);
      return;
    }
    await this.client.set(key, value, "EX", ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async takeToken(key: string, capacity: number, windowMs: number): Promise<BucketResult> {
    return this.bucket.take(key, capacity, windowMs);
  }
}
