import { describe, it, expect } from "vitest";
import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";

const url = process.env.REDIS_QUEUE_URL ?? "redis://localhost:6379";
const describeIf = process.env.REDIS_LIVE ? describe : describe.skip;

describeIf("queue round-trip (redis-queue)", () => {
  it("enqueue -> worker completes with echo", async () => {
    const connection = new Redis(url, { maxRetriesPerRequest: null });
    const queue = new Queue("hrms", { connection: connection.duplicate() });
    const events = new QueueEvents("hrms", { connection: connection.duplicate() });
    await events.waitUntilReady();
    const job = await queue.add("test-job", { ping: "hello-1b" }, { jobId: `t-${Date.now()}` });
    const result = await job.waitUntilFinished(events, 15000);
    expect((result as { echoed: string }).echoed).toBe("hello-1b");
    await events.close();
    await queue.close();
    connection.disconnect();
  }, 20000);
});
