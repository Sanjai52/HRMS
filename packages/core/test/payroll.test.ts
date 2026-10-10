import { describe, it, expect } from "vitest";
import { computePay, monthRange, overlapWorkdays } from "../src/payroll.js";

describe("payroll math (paise integers)", () => {
  it("computes the documented demonstrator formula exactly", () => {
    const out = computePay({
      basicPaise: 5000000,
      allowancesPaise: 2000000,
      otherDeductionsPaise: 50000,
      pfPct: 12,
      taxPct: 10,
      scheduledDays: 22,
      unpaidDays: 2,
    });
    expect(out.grossPaise).toBe(7000000);
    expect(out.dailyPaise).toBe(318182);
    expect(out.lopPaise).toBe(636364);
    expect(out.pfPaise).toBe(600000);
    expect(out.taxPaise).toBe(700000);
    expect(out.netPaise).toBe(7000000 - 636364 - 600000 - 700000 - 50000);
    expect(Number.isInteger(out.netPaise)).toBe(true);
  });

  it("clamps unpaid days to scheduled days", () => {
    const out = computePay({ basicPaise: 100000, allowancesPaise: 0, otherDeductionsPaise: 0, pfPct: 0, taxPct: 0, scheduledDays: 20, unpaidDays: 99 });
    expect(out.lopPaise).toBe(5000 * 20);
    expect(out.netPaise).toBe(0);
  });

  it("month ranges and overlaps skip weekends", () => {
    expect(monthRange("2026-10")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(overlapWorkdays("2026-10-19", "2026-10-21", "2026-10-01", "2026-10-31", new Set())).toBe(3);
    expect(overlapWorkdays("2026-10-19", "2026-10-21", "2026-10-01", "2026-10-31", new Set(["2026-10-20"]))).toBe(2);
    expect(overlapWorkdays("2026-11-01", "2026-11-02", "2026-10-01", "2026-10-31", new Set())).toBe(0);
  });
});
