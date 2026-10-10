import { describe, it, expect } from "vitest";
import { buildRing, ownerOfBucket } from "../src/ring.js";

describe("consistent-hash ring", () => {
  it("maps every bucket deterministically to a member", () => {
    const ring = buildRing(["shard-1", "shard-2", "shard-3"], 128);
    for (const b of [0, 1, 127, 255]) {
      const o1 = ownerOfBucket(b, ring);
      const o2 = ownerOfBucket(b, buildRing(["shard-1", "shard-2", "shard-3"], 128));
      expect(["shard-1", "shard-2", "shard-3"]).toContain(o1);
      expect(o2).toBe(o1);
    }
  });
});
