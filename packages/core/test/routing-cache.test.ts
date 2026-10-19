import { describe, it, expect, vi, afterEach } from "vitest";
import { buildMapV1 } from "../src/shard-router.js";
import { stableEmployeeBucket } from "../src/bucket.js";
import { RoutingCache } from "../src/routing-cache.js";

const EMPLOYEE = buildMapV1(["shard-1", "shard-2", "shard-3"]);

function shardOfInFixture(employeeId: string): string {
  const bucket = stableEmployeeBucket(employeeId);
  const row = EMPLOYEE.find((r) => r.bucket === bucket);
  if (!row) throw new Error("bucket missing from fixture");
  return row.shard;
}

class FakeCatalog {
  fail = false;
  calls: string[] = [];
  identityRows: Array<{ user_id: string; employee_id: string }> = [
    { user_id: "u-1", employee_id: "e-1" },
    { user_id: "u-2", employee_id: "e-2" },
  ];

  async query(text: string): Promise<{ rows: Array<Record<string, unknown>> }> {
    if (this.fail) throw new Error("catalog down");
    this.calls.push(text);
    if (text.includes("FROM routing_map_versions")) return { rows: [{ version: 1 }] };
    if (text.includes("FROM routing_map_buckets")) {
      return { rows: EMPLOYEE.map((r) => ({ bucket_id: r.bucket, shard_id: r.shard })) };
    }
    if (text.includes("FROM users")) return { rows: this.identityRows };
    throw new Error(`unexpected query: ${text}`);
  }
}

function identityCalls(fake: FakeCatalog): number {
  return fake.calls.filter((c) => c.includes("FROM users")).length;
}

describe("RoutingCache (D-002 snapshot)", () => {
  afterEach(() => vi.useRealTimers());

  it("resolves shard + identity from a refresh", async () => {
    const cache = new RoutingCache(new FakeCatalog());
    await cache.refresh();
    expect(await cache.shardOf("e-1")).toBe(shardOfInFixture("e-1"));
    expect(await cache.employeeIdOf("u-1")).toBe("e-1");
    expect(await cache.employeeIdOf("nope")).toBeNull();
    expect(cache.state()).toEqual({ mapVersion: 1, identitySize: 2 });
  });

  it("keeps serving from the last snapshot when the catalog goes away", async () => {
    const fake = new FakeCatalog();
    const cache = new RoutingCache(fake);
    await cache.refresh();
    fake.fail = true;
    expect(await cache.shardOf("e-2")).toBe(shardOfInFixture("e-2"));
    expect(await cache.employeeIdOf("u-2")).toBe("e-2");
    await expect(cache.refresh()).rejects.toThrow("catalog down");
    // a failed refresh must not clear the snapshot
    expect(await cache.shardOf("e-1")).toBe(shardOfInFixture("e-1"));
    expect(cache.state().identitySize).toBe(2);
    // an unknown user cannot be verified while the catalog is down: fail closed
    await expect(cache.employeeIdOf("u-9")).rejects.toThrow("catalog down");
  });

  it("fails closed when empty and the catalog is down", async () => {
    const fake = new FakeCatalog();
    fake.fail = true;
    const cache = new RoutingCache(fake);
    await expect(cache.shardOf("e-1")).rejects.toThrow("catalog down");
    await expect(cache.employeeIdOf("u-1")).rejects.toThrow("catalog down");
  });

  it("lazy-loads once when empty with a healthy catalog", async () => {
    const cache = new RoutingCache(new FakeCatalog());
    expect(await cache.shardOf("e-1")).toBe(shardOfInFixture("e-1"));
    expect(await cache.employeeIdOf("u-1")).toBe("e-1");
  });

  it("a miss re-reads identity so a just-projected employee works immediately", async () => {
    const fake = new FakeCatalog();
    const cache = new RoutingCache(fake, 0);
    await cache.refresh();
    const before = identityCalls(fake);
    // The directory row lands after the last snapshot refresh (onboarding ->
    // first self-service action): a miss must re-read instead of returning null.
    fake.identityRows.push({ user_id: "u-3", employee_id: "e-3" });
    expect(await cache.employeeIdOf("u-3")).toBe("e-3");
    expect(identityCalls(fake)).toBe(before + 1);
    expect(await cache.employeeIdOf("nope")).toBeNull();
  });

  it("throttles miss re-reads for genuinely unknown users", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T00:00:00.000Z"));
    const fake = new FakeCatalog();
    const cache = new RoutingCache(fake); // default 1 s throttle
    await cache.refresh();
    const before = identityCalls(fake);
    expect(await cache.employeeIdOf("nope-1")).toBeNull();
    expect(identityCalls(fake)).toBe(before + 1); // miss -> one re-read
    expect(await cache.employeeIdOf("nope-2")).toBeNull();
    expect(identityCalls(fake)).toBe(before + 1); // throttled: no second read
    vi.setSystemTime(new Date(Date.now() + 1001));
    expect(await cache.employeeIdOf("nope-3")).toBeNull();
    expect(identityCalls(fake)).toBe(before + 2); // window elapsed -> re-read again
  });
});
