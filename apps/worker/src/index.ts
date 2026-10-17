import "dotenv/config";
import { Worker, type Job, Queue } from "bullmq";
import { Redis } from "ioredis";
import nodemailer from "nodemailer";
import type { JobName } from "@hrms/core";
import { runDispatcherOnce, loadActiveMap, runPayrollChunk, createIdIssuer, type IdIssuer } from "@hrms/core";
import { runCrawlRun } from "./crawl.js";
import { catalogPool as catalog, shardPools as shards } from "./pools.js";

async function registerWorker(): Promise<void> {
  try {
    const gate = await catalog.query("SELECT epoch, state FROM catalog_write_gate WHERE id = 1");
    const map = await catalog.query("SELECT version FROM routing_map_versions WHERE domain = 'employee' AND active = TRUE");
    const pid = `worker:${process.pid}`;
    await catalog.query(
      "INSERT INTO process_registry (process_id, kind, owner, heartbeat_at, expires_at, map_version_loaded, gate_epoch_ack, gate_epoch, gate_state) VALUES ($1,'WORKER',$2,now(), now() + make_interval(secs => 30), $3, $4, $4, $5) ON CONFLICT (process_id) DO UPDATE SET heartbeat_at = now(), expires_at = now() + make_interval(secs => 30)",
      [pid, pid, (map.rows[0] as { version: number } | undefined)?.version ?? 1, (gate.rows[0] as { epoch: number } | undefined)?.epoch ?? 0, (gate.rows[0] as { state: string } | undefined)?.state ?? "OPEN"]
    );
    setInterval(async () => {
      try {
        const g = await catalog.query("SELECT epoch, state FROM catalog_write_gate WHERE id = 1");
        const m = await catalog.query("SELECT version FROM routing_map_versions WHERE domain = 'employee' AND active = TRUE");
        await catalog.query("UPDATE process_registry SET heartbeat_at = now(), expires_at = now() + make_interval(secs => 30), map_version_loaded = $2, gate_epoch_ack = $3, gate_epoch = $3, gate_state = $4 WHERE process_id = $1", [
          pid,
          (m.rows[0] as { version: number } | undefined)?.version ?? 1,
          (g.rows[0] as { epoch: number } | undefined)?.epoch ?? 0,
          (g.rows[0] as { state: string } | undefined)?.state ?? "OPEN",
        ]);
      } catch {
        // unreachable catalog: local deadline bounds further writes
      }
    }, 5000).unref?.();
  } catch (e) {
    console.error("process registry unavailable at startup:", (e as Error).message);
  }
}

registerWorker();

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

let issuer: IdIssuer | null = null;
createIdIssuer(catalog, `worker:${process.pid}`)
  .then((i) => {
    issuer = i;
  })
  .catch((e) => console.error("worker-id lease unavailable:", (e as Error).message));

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
    case "crawler-run": {
      const { runId } = job.data as { runId: string };
      if (!issuer) throw new Error("worker-id lease unavailable");
      return runCrawlRun(
        {
          catalog,
          shards,
          portalBase: process.env.PORTAL_BASE ?? "http://localhost:4100",
          nextId: () => (issuer as IdIssuer).next(),
        },
        runId
      );
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
