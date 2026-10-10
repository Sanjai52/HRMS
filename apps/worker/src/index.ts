import "dotenv/config";
import { Worker, type Job, Queue } from "bullmq";
import { Redis } from "ioredis";
import nodemailer from "nodemailer";
import type { JobName } from "@hrms/core";
import { runDispatcherOnce, loadActiveMap, runPayrollChunk } from "@hrms/core";
import { catalogPool as catalog, shardPools as shards } from "./pools.js";

const queueConnection = new Redis(process.env.REDIS_QUEUE_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const kv = new Redis(process.env.REDIS_KV_URL ?? "redis://localhost:6380", { maxRetriesPerRequest: 3 });
const queue = new Queue("hrms", { connection: queueConnection });
const mailer = nodemailer.createTransport({
  host: process.env.EMAIL_SMTP_HOST ?? "localhost",
  port: Number(process.env.EMAIL_SMTP_PORT ?? 1025),
  secure: false,
});

async function handle(job: Job): Promise<unknown> {
  switch (job.name as JobName) {
    case "test-job":
      return { echoed: (job.data as { ping?: string }).ping ?? null, at: new Date().toISOString() };
    case "payroll-chunk": {
      const { batchId, period, shard } = job.data as { batchId: string; period: string; shard: string };
      const pool = shards[shard];
      if (!pool) throw new Error(`unknown-shard:${shard}`);
      return runPayrollChunk({ catalog, shard: pool }, batchId, period, shard);
    }
    case "notification": {
      const { notificationId, employeeId, shard } = job.data as { notificationId: string; employeeId: string; shard: string };
      const pool = shards[shard];
      if (!pool) throw new Error(`unknown-shard:${shard}`);
      const n = await pool.query("SELECT title, body FROM notifications WHERE notification_id = $1", [notificationId]);
      if (n.rows.length === 0) return { skipped: true };
      const e = await pool.query("SELECT email FROM employees WHERE employee_id = $1", [employeeId]);
      if (e.rows.length === 0) return { skipped: true };
      await mailer.sendMail({
        from: "HRMS <no-reply@hrms.local>",
        to: (e.rows[0] as { email: string }).email,
        subject: `HRMS: ${(n.rows[0] as { title: string }).title}`,
        text: (n.rows[0] as { body: string }).body,
      });
      return { emailed: notificationId };
    }
    default:
      throw new Error(`unknown-job:${job.name}`);
  }
}

const worker = new Worker("hrms", handle, { connection: queueConnection });
worker.on("completed", (job) => console.log(`worker completed ${job.id} (${job.name})`));
worker.on("failed", (job, err) => console.log(`worker failed ${job?.id} (${job?.name}): ${err.message}`));

async function dispatchLoop(): Promise<void> {
  try {
    const { map } = await loadActiveMap(catalog);
    const counts = await runDispatcherOnce({
      catalog,
      shards,
      redis: kv,
      map,
      enqueue: (name, data, opts) => queue.add(name, data as object, { jobId: opts?.jobId, attempts: 3, removeOnComplete: 100 }),
    });
    if (counts.delivered > 0 || counts.failed > 0) console.log(`dispatcher delivered=${counts.delivered} failed=${counts.failed}`);
  } catch (e) {
    console.log(`dispatcher error: ${(e as Error).message}`);
  } finally {
    setTimeout(dispatchLoop, 2000).unref?.();
  }
}

dispatchLoop();
console.log("worker listening on queue hrms + outbox dispatcher");
