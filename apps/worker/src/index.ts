import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import type { JobName } from "@hrms/core";
import { runDispatcherOnce } from "@hrms/core";
import { catalogPool as catalog, shardPools as shards } from "./pools.js";

const queueConnection = new Redis(process.env.REDIS_QUEUE_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

async function handle(job: Job): Promise<unknown> {
  switch (job.name as JobName) {
    case "test-job":
      return { echoed: (job.data as { ping?: string }).ping ?? null, at: new Date().toISOString() };
    default:
      throw new Error(`unknown-job:${job.name}`);
  }
}

const worker = new Worker("hrms", handle, { connection: queueConnection });
worker.on("completed", (job) => console.log(`worker completed ${job.id} (${job.name})`));
worker.on("failed", (job, err) => console.log(`worker failed ${job?.id} (${job?.name}): ${err.message}`));

const kv = new Redis(process.env.REDIS_KV_URL ?? "redis://localhost:6380", { maxRetriesPerRequest: 3 });

async function dispatchLoop(): Promise<void> {
  try {
    const counts = await runDispatcherOnce({ catalog, shards, redis: kv });
    if (counts.delivered > 0 || counts.failed > 0) console.log(`dispatcher delivered=${counts.delivered} failed=${counts.failed}`);
  } catch (e) {
    console.log(`dispatcher error: ${(e as Error).message}`);
  } finally {
    setTimeout(dispatchLoop, 2000).unref?.();
  }
}

dispatchLoop();
console.log("worker listening on queue hrms + outbox dispatcher");
