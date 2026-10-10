import { describe, it, expect } from "vitest";
import { parseListingIds, hasNextPage, parseProfile, normalizeEmail, fingerprint } from "../src/crawler.js";

const LISTING = `<article class="profile" data-id="p01"><h2 class="name">A</h2></article><article class="profile" data-id="p02"><h2 class="name">B</h2></article><nav><a rel="next" href="/listings?page=2">Next</a></nav>`;
const PROFILE = `<article class="profile" data-id="p01"><h1 class="name">Nila Fernando</h1><dd class="email">Nila@example.com</dd><dd class="phone">123</dd><dd class="skills">Node.js, Postgres</dd><dd class="exp">4 years</dd></article>`;

describe("crawler parsing", () => {
  it("extracts listing ids and detects pagination", () => {
    expect(parseListingIds(LISTING)).toEqual(["p01", "p02"]);
    expect(hasNextPage(LISTING)).toBe(true);
    expect(hasNextPage("<p>done</p>")).toBe(false);
  });

  it("normalizes profile fields", () => {
    const p = parseProfile(PROFILE, "p01");
    expect(p?.name).toBe("Nila Fernando");
    expect(normalizeEmail(p?.email ?? "")).toBe("nila@example.com");
    expect(p?.skills).toEqual(["node.js", "postgres"]);
    expect(p?.expYears).toBe(4);
  });

  it("rejects bad emails and fingerprints the identity-less", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    const p = parseProfile(PROFILE, "x");
    expect(fingerprint(p!).startsWith("noid:")).toBe(true);
  });

  it("rejects nameless pages", () => {
    expect(parseProfile("<p>empty</p>", "x")).toBeNull();
  });
});
