import { describe, it, expect } from "vitest";
import { stableEmployeeBucket } from "../src/bucket.js";

const VECTORS: Array<[string, number]> = [
  ["11111111-1111-1111-1111-111111111111", 156],
  ["22222222-2222-2222-2222-222222222222", 0],
  ["123e4567-e89b-12d3-a456-426614174000", 201],
];

describe("golden UUID-to-bucket vectors", () => {
  for (const [uuid, expected] of VECTORS) {
    it(`${uuid} -> ${expected}`, () => {
      expect(stableEmployeeBucket(uuid)).toBe(expected);
    });
  }
});
