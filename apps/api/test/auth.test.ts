import { describe, it, expect, beforeAll } from "vitest";

const base = process.env.API_BASE ?? "http://localhost:4000";

describe("Phase 1a auth slice", () => {
  beforeAll(async () => {
    await fetch(`${base}/system/test/reset-limiter`, { method: "POST" });
  });
  it("seeded HR can login and read directory; bad password rejected; anonymous denied", async () => {
    const login = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "hr@hrms.local", password: "ChangeMe123!" }),
    });
    expect(login.status).toBe(200);
    const { data } = (await login.json()) as { data: { token: string } };
    expect(typeof data.token).toBe("string");

    const dir = await fetch(`${base}/api/v1/employees?limit=5`, {
      headers: { authorization: `Bearer ${data.token}` },
    });
    expect(dir.status).toBe(200);
    const dirBody = (await dir.json()) as { data: unknown[] };
    expect(dirBody.data.length).toBeGreaterThan(0);

    const bad = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "hr@hrms.local", password: "wrong" }),
    });
    expect(bad.status).toBe(401);

    const anon = await fetch(`${base}/api/v1/employees`);
    expect(anon.status).toBe(401);
  });
});
