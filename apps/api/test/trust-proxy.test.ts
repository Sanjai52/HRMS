import { describe, it, expect } from "vitest";
import { parseTrustProxy } from "../src/trust-proxy.js";

describe("parseTrustProxy", () => {
  it("accepts a single IPv4 address or CIDR subnet unchanged", () => {
    expect(parseTrustProxy("172.16.0.0/12")).toBe("172.16.0.0/12");
    expect(parseTrustProxy("10.0.0.1")).toBe("10.0.0.1");
    expect(parseTrustProxy(" 192.168.1.0/24 ")).toBe("192.168.1.0/24");
  });

  it("accepts a hop count as a number", () => {
    expect(parseTrustProxy("1")).toBe(1);
    expect(typeof parseTrustProxy("2")).toBe("number");
  });

  it("accepts comma-separated mixes of subnets and hop counts", () => {
    expect(parseTrustProxy("172.16.0.0/12, 10.0.0.0/8, 1")).toEqual(["172.16.0.0/12", "10.0.0.0/8", 1]);
  });

  it("accepts IPv6 addresses and subnets", () => {
    expect(parseTrustProxy("::1")).toBe("::1");
    expect(parseTrustProxy("fc00::/7")).toBe("fc00::/7");
  });

  it("throws on an invalid token", () => {
    expect(() => parseTrustProxy("not-an-ip")).toThrow(/invalid TRUST_PROXY/);
    expect(() => parseTrustProxy("172.16.0.0/12,abc")).toThrow(/invalid TRUST_PROXY/);
    expect(() => parseTrustProxy("loopback")).toThrow(/invalid TRUST_PROXY/);
  });

  it("throws on out-of-range IPv4 octets or prefixes", () => {
    expect(() => parseTrustProxy("999.1.1.1")).toThrow(/invalid TRUST_PROXY/);
    expect(() => parseTrustProxy("10.0.0.0/33")).toThrow(/invalid TRUST_PROXY/);
  });

  it("throws on an empty value", () => {
    expect(() => parseTrustProxy("")).toThrow(/at least one/);
    expect(() => parseTrustProxy(" , ")).toThrow(/at least one/);
  });
});
