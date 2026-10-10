import { describe, it, expect } from "vitest";
import { stableEmployeeBucket } from "../src/bucket.js";

describe("stableEmployeeBucket", () => {
  it("is deterministic, case-insensitive and in range", () => {
    const a = stableEmployeeBucket("123e4567-e89b-12d3-a456-426614174000");
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(256);
    expect(stableEmployeeBucket("123E4567-E89B-12D3-A456-426614174000")).toBe(a);
  });
});
