import { describe, it, expect } from "vitest";
import { buildRing, ownerOfBucket } from "../src/ring.js";
import { buildMapV1 } from "../src/shard-router.js";

describe("materialized map equals ring output", () => {
  it("v1 rows match ring owners for every bucket", () => {
    const members = ["shard-1", "shard-2", "shard-3"];
    const ring = buildRing(members, 128);
    const rows = buildMapV1(members, 128);
    expect(rows).toHaveLength(256);
    for (const row of rows) {
      expect(row.shard).toBe(ownerOfBucket(row.bucket, ring));
    }
  });
});
