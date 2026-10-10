import { describe, it, expect } from "vitest";
import { createStorage } from "../src/storage/minio.js";
import { createEmail } from "../src/email/mailpit.js";

const describeIf = process.env.STORAGE_LIVE ? describe : describe.skip;

describeIf("storage round-trip (minio)", () => {
  it("put -> get returns identical bytes", async () => {
    const storage = createStorage();
    const key = `phase1b/${Date.now()}.txt`;
    await storage.putObject(key, Buffer.from("hrms-1b"), "text/plain");
    const out = await storage.getObject(key);
    expect(out.toString()).toBe("hrms-1b");
  }, 20000);
});

const describeMail = process.env.MAIL_LIVE ? describe : describe.skip;

describeMail("email capture (mailpit)", () => {
  it("send -> retrievable via mailpit api", async () => {
    const email = createEmail();
    const subject = `hrms-1b-${Date.now()}`;
    await email.send({ to: "hr@hrms.local", subject, text: "hello" });
    const res = await fetch("http://localhost:8025/api/v1/search?query=" + encodeURIComponent(subject));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number };
    expect(body.total).toBeGreaterThan(0);
  }, 20000);
});
