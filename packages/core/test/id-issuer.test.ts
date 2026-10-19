import { describe, it, expect, vi, afterEach } from "vitest";
import { createIdIssuer } from "../src/leases.js";
import {
  LeaseExpiredError,
  WORKER_LEASE_MARGIN_MS,
  WORKER_LEASE_RENEW_MS,
  WORKER_LEASE_TTL_MS,
} from "../src/snowflake.js";

class FakeCatalog {
  down = false;
  renewCalls = 0;

  async query(text: string): Promise<{ rows: Array<Record<string, unknown>> }> {
    if (this.down) throw new Error("catalog down");
    if (text.includes("INSERT INTO worker_id_leases")) return { rows: [{ worker_id: 0 }] };
    if (text.includes("UPDATE worker_id_leases")) {
      this.renewCalls += 1;
      return { rows: [{ worker_id: 0 }] };
    }
    throw new Error(`unexpected query: ${text}`);
  }
}

describe("IdIssuer lease window (D-003)", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps generating until ~45 s after the last successful renewal, then fails closed and recovers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T00:00:00.000Z"));
    const fake = new FakeCatalog();
    const issuer = await createIdIssuer(fake, "test-owner");

    expect(issuer.next()).toMatch(/^\d+$/);

    // Catalog goes away: every renewal attempt from here on fails.
    fake.down = true;
    await vi.advanceTimersByTimeAsync(WORKER_LEASE_RENEW_MS); // failed renewal at +10 s
    expect(issuer.next()).toMatch(/^\d+$/); // a failed attempt must not cut the window short

    await vi.advanceTimersByTimeAsync(WORKER_LEASE_RENEW_MS * 3); // +40 s overall, failures at +20/30/40 s
    expect(issuer.next()).toMatch(/^\d+$/);

    // Cross the window end (last success + TTL − margin = +45 s): fail closed.
    await vi.advanceTimersByTimeAsync(
      WORKER_LEASE_TTL_MS - WORKER_LEASE_MARGIN_MS - WORKER_LEASE_RENEW_MS * 4 + 1
    );
    expect(() => issuer.next()).toThrow(LeaseExpiredError);

    // Catalog returns: the next successful renewal reopens the window.
    fake.down = false;
    await vi.advanceTimersByTimeAsync(WORKER_LEASE_RENEW_MS);
    expect(issuer.next()).toMatch(/^\d+$/);
    expect(fake.renewCalls).toBeGreaterThan(0);
    issuer.stop();
  });
});
