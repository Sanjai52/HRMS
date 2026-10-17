import { describe, it, expect } from "vitest";
import { buildMapV1, loadActiveMap } from "../src/shard-router.js";
import { buildCandidateMapV1 } from "../src/recruitment.js";

const EMPLOYEE = buildMapV1(["shard-1", "shard-2", "shard-3"]);
const CANDIDATE = buildCandidateMapV1(["shard-2"]);

class FakeCatalog {
  calls: string[] = [];

  constructor(private noEmployee = false) {}

  async query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> {
    this.calls.push(text);
    if (text.includes("FROM routing_map_versions")) {
      if (/domain\s*=\s*'employee'/.test(text)) {
        return { rows: this.noEmployee ? [] : [{ version: 1 }] };
      }
      if (/domain\s*=\s*'candidate'/.test(text)) return { rows: [{ version: 2 }] };
      // The buggy cross-domain lookup would take the highest active version,
      // which is the candidate map (v2) in this fixture.
      return { rows: [{ version: 2 }] };
    }
    if (text.includes("FROM routing_map_buckets")) {
      return { rows: (params?.[0] === 1 ? EMPLOYEE : CANDIDATE).map((r) => ({ bucket_id: r.bucket, shard_id: r.shard })) };
    }
    throw new Error(`unexpected query: ${text}`);
  }
}

describe("loadActiveMap employee-domain scoping", () => {
  it("returns the employee map even when a higher-version candidate map is active", async () => {
    const fake = new FakeCatalog();
    const { version, map } = await loadActiveMap(fake);
    expect(version).toBe(1);
    expect(map.size).toBe(256);
    for (const row of EMPLOYEE) expect(map.get(row.bucket)).toBe(row.shard);
    // If the candidate map had been loaded instead, buckets owned by shard-1
    // or shard-3 in the employee map would point at shard-2.
    expect(CANDIDATE.some((r) => map.get(r.bucket) !== r.shard)).toBe(true);
  });

  it("the version lookup filters by the employee domain", async () => {
    const fake = new FakeCatalog();
    await loadActiveMap(fake);
    const versionQuery = fake.calls[0];
    expect(versionQuery).toContain("FROM routing_map_versions");
    expect(versionQuery).toContain("domain = 'employee'");
    expect(versionQuery).toContain("active = TRUE");
  });

  it("still fails closed when no active employee map exists", async () => {
    const fake = new FakeCatalog(true);
    await expect(loadActiveMap(fake)).rejects.toThrow("no-active-routing-map");
  });
});
