import { describe, it, expect } from "vitest";
import { registrationValid } from "../src/registration.js";

describe("registry write deadline (D-002)", () => {
  const TTL = 30_000;
  const MARGIN = 10_000;

  it("is valid one millisecond before the deadline", () => {
    expect(registrationValid(0, TTL - MARGIN - 1, TTL, MARGIN)).toBe(true);
  });

  it("is invalid at the deadline and beyond", () => {
    expect(registrationValid(0, TTL - MARGIN, TTL, MARGIN)).toBe(false);
    expect(registrationValid(0, TTL - MARGIN + 1, TTL, MARGIN)).toBe(false);
  });

  it("is invalid after a clock jump", () => {
    // Backward jump (monotonic clock reset / moved back): fail closed.
    expect(registrationValid(50_000, 10_000, TTL, MARGIN)).toBe(false);
    // Forward jump far past the deadline: expired.
    expect(registrationValid(0, TTL * 10, TTL, MARGIN)).toBe(false);
  });

  it("is invalid when no heartbeat send was recorded", () => {
    expect(registrationValid(null, 0, TTL, MARGIN)).toBe(false);
    expect(registrationValid(null, 1_000_000, TTL, MARGIN)).toBe(false);
  });

  it("uses the D-002 defaults when ttl and margin are omitted", () => {
    expect(registrationValid(0, 19_999)).toBe(true);
    expect(registrationValid(0, 20_000)).toBe(false);
  });
});
