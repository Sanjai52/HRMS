import { describe, it, expect } from "vitest";
import { Snowflake, ClockBackwardError, LeaseExpiredError } from "../src/snowflake.js";

describe("snowflake generator", () => {
  it("produces ordered unique decimal strings", () => {
    let t = 1_800_000_000_000;
    const gen = new Snowflake(7, () => t);
    const a = gen.next();
    t += 1;
    const b = gen.next();
    expect(/^\d+$/.test(a)).toBe(true);
    expect(BigInt(b) > BigInt(a)).toBe(true);
  });

  it("two workers never collide in the same millisecond", () => {
    const t = 1_800_000_000_000;
    const ids = new Set([new Snowflake(1, () => t).next(), new Snowflake(2, () => t).next()]);
    expect(ids.size).toBe(2);
  });

  it("refuses when the clock moves backward", () => {
    let t = 1_800_000_000_000;
    const gen = new Snowflake(3, () => t);
    gen.next();
    t -= 5;
    expect(() => gen.next()).toThrow(ClockBackwardError);
  });

  it("refuses after the lease deadline", () => {
    const gen = new Snowflake(4, () => 1_800_000_000_000);
    expect(() => gen.next(1_799_999_999_999)).toThrow(LeaseExpiredError);
  });
});
