import { describe, it, expect } from "vitest";
import { Redis } from "ioredis";
import { RedisKvStore, type KvRedisClient } from "../src/kv.js";

class FakeKvClient implements KvRedisClient {
  store = new Map<string, string>();
  setCalls: Array<{ key: string; value: string; expiryMode?: string; ttlSeconds?: number }> = [];
  evalCalls: Array<{ script: string; numKeys: number; args: Array<string | number> }> = [];
  evalReply: [number, number, number] = [1, 9, 0];

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, expiryMode?: string, ttlSeconds?: number): Promise<unknown> {
    this.setCalls.push({ key, value, expiryMode, ttlSeconds });
    this.store.set(key, value);
    return "OK";
  }

  async del(key: string): Promise<unknown> {
    return this.store.delete(key) ? 1 : 0;
  }

  async eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown> {
    this.evalCalls.push({ script, numKeys, args });
    return this.evalReply;
  }
}

describe("RedisKvStore with a fake client", () => {
  it("get returns null for a missing key and the stored value otherwise", async () => {
    const store = new RedisKvStore(new FakeKvClient());
    expect(await store.get("session:x")).toBeNull();
    await store.set("session:x", "{\"userId\":\"u1\"}");
    expect(await store.get("session:x")).toBe("{\"userId\":\"u1\"}");
  });

  it("set without TTL calls SET without EX; set with TTL passes EX <ttl>", async () => {
    const fake = new FakeKvClient();
    const store = new RedisKvStore(fake);
    await store.set("short:abc", "/jobs/9");
    expect(fake.setCalls[0]).toEqual({ key: "short:abc", value: "/jobs/9", expiryMode: undefined, ttlSeconds: undefined });
    await store.set("session:y", "v", 3600);
    expect(fake.setCalls[1]).toEqual({ key: "session:y", value: "v", expiryMode: "EX", ttlSeconds: 3600 });
  });

  it("del removes the value", async () => {
    const store = new RedisKvStore(new FakeKvClient());
    await store.set("k", "v");
    await store.del("k");
    expect(await store.get("k")).toBeNull();
  });

  it("takeToken delegates to the TokenBucket Lua on the rl: prefix and maps an allow reply", async () => {
    const fake = new FakeKvClient();
    const store = new RedisKvStore(fake);
    const result = await store.takeToken("login:203.0.113.9", 30, 60_000);
    expect(result).toEqual({ allowed: true, remaining: 9, retryAfterMs: 0 });
    expect(fake.evalCalls).toHaveLength(1);
    const call = fake.evalCalls[0];
    expect(call.numKeys).toBe(1);
    expect(call.args[0]).toBe("rl:login:203.0.113.9");
    expect(call.args[1]).toBe(30);
    expect(call.args[2]).toBeCloseTo(30 / 60_000);
    expect(typeof call.args[3]).toBe("number");
    expect(call.args[4]).toBe(120_000);
    expect(call.script).toContain("HMGET");
  });

  it("takeToken maps a deny reply", async () => {
    const fake = new FakeKvClient();
    fake.evalReply = [0, 0, 2500];
    const store = new RedisKvStore(fake);
    expect(await store.takeToken("login:anon", 30, 60_000)).toEqual({ allowed: false, remaining: 0, retryAfterMs: 2500 });
  });
});

const url = process.env.REDIS_KV_URL ?? "redis://localhost:6380";
const describeIf = process.env.REDIS_LIVE ? describe : describe.skip;

describeIf("RedisKvStore against a live redis-kv", () => {
  it("50 concurrent takeToken calls on capacity 10 allow exactly 10", async () => {
    const client = new Redis(url, { maxRetriesPerRequest: 3 });
    try {
      const store = new RedisKvStore(client);
      const key = `kvtest:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const results = await Promise.all(Array.from({ length: 50 }, () => store.takeToken(key, 10, 60_000)));
      expect(results.filter((r) => r.allowed)).toHaveLength(10);
      await client.del(`rl:${key}`);
    } finally {
      client.disconnect();
    }
  }, 20_000);

  it("set with a TTL expires while a no-TTL value survives until del", async () => {
    const client = new Redis(url, { maxRetriesPerRequest: 3 });
    try {
      const store = new RedisKvStore(client);
      const ttlKey = `kvttl:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const plainKey = `kvplain:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      await store.set(ttlKey, "v", 1);
      expect(await store.get(ttlKey)).toBe("v");
      let value: string | null = "v";
      for (let i = 0; i < 50 && value !== null; i++) {
        await new Promise((r) => setTimeout(r, 100));
        value = await store.get(ttlKey);
      }
      expect(value).toBeNull();
      await store.set(plainKey, "w");
      expect(await store.get(plainKey)).toBe("w");
      await store.del(plainKey);
      expect(await store.get(plainKey)).toBeNull();
    } finally {
      client.disconnect();
    }
  }, 20_000);
});
