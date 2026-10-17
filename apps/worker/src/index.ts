import "dotenv/config";
import { Worker, type Job, Queue } from "bullmq";
import { Redis } from "ioredis";
import nodemailer from "nodemailer";
import type { JobName } from "@hrms/core";
import { runDispatcherOnce, loadActiveMap, runPayrollChunk, createIdIssuer, registrationValid, type IdIssuer } from "@hrms/core";
import { runCrawlRun } from "./crawl.js";
import { catalogPool as catalog, shardPools as shards } from "./pools.js";

const REGISTRY_TTL_MS = Number(process.env.REGISTRY_TTL_MS ?? 30000);
const REGISTRY_MARGIN_MS = Number(process.env.REGISTRY_MARGIN_MS ?? 10000);

// Monotonic time of the worker's last heartbeat that reached the registry.
let lastHeartbeatSentMono: number | null = null;

function nowMono(): number {
  return Number(process.hrtime.bigint() / 1000000n);
}

// State-changing jobs stop `REGISTRY_TTL_MS - REGISTRY_MARGIN_MS` after the
// last heartbeat send (D-002). While the catalog is up the heartbeat keeps
// this valid; on expiry the job throws so BullMQ retries it later.
function assertWorkerRegistrationValid(): void {
  if (!registrationValid(lastHeartbeatSentMono, nowMono(), REGISTRY_TTL_MS, REGISTRY_MARGIN_MS)) {
    throw new Error("registration-expired: refusing state-changing job");
  }
}

async function registerWorker(): Promise<void> {
  try {
    const gate = await catalog.query("SELECT epoch, state FROM catalog_write_gate WHERE id = 1");
    const map = await catalog.query("SELECT version FROM routing_map_versions WHERE domain = 'employee' AND active = TRUE");
    const pid = `worker:${process.pid}`;
    await catalog.query(
      "INSERT INTO process_registry (process_id, kind, owner, heartbeat_at, expires_at, map_version_loaded, gate_epoch_ack, gate_epoch, gate_state) VALUES ($1,'WORKER',$2,now(), now() + make_interval(secs => $6), $3, $4, $4, $5) ON CONFLICT (process_id) DO UPDATE SET heartbeat_at = now(), expires_at = now() + make_interval(secs => $6)",
      [pid, pid, (map.rows[0] as { version: number } | undefined)?.version ?? 1, (gate.rows[0] as { epoch: number } | undefined)?.epoch ?? 0, (gate.rows[0] as { state: string } | undefined)?.state ?? "OPEN", REGISTRY_TTL_MS / 1000]
    );
    lastHeartbeatSentMono = nowMono();
    setInterval(async () => {
      try {
        const g = await catalog.query("SELECT epoch, state FROM catalog_write_gate WHERE id = 1");
        const m = await catalog.query("SELECT version FROM routing_map_versions WHERE domain = 'employee' AND active = TRUE");
        await catalog.query("UPDATE process_registry SET heartbeat_at = now(), expires_at = now() + make_interval(secs => $5), map_version_loaded = $2, gate_epoch_ack = $3, gate_epoch = $3, gate_state = $4 WHERE process_id = $1", [
          pid,
          (m.rows[0] as { version: number } | undefined)?.version ?? 1,
          (g.rows[0] as { epoch: number } | undefined)?.epoch ?? 0,
          (g.rows[0] as { state: string } | undefined)?.state ?? "OPEN",
          REGISTRY_TTL_MS / 1000,
        ]);
        lastHeartbeatSentMono = nowMono();
      } catch {
        // unreachable catalog: the local deadline stops state-changing jobs (D-002)
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
      assertWorkerRegistrationValid();
      const { batchId, period, shard } = job.data as { batchId: string; period: string; shard: string };
      const pool = shards[shard];
      if (!pool) throw new Error(`unknown-shard:${shard}`);
      return runPayrollChunk({ catalog, shard: pool }, batchId, period, shard);
    }
    case "crawler-run": {
      assertWorkerRegistrationValid();
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
    case "announcement-fanout": {
      assertWorkerRegistrationValid();
      const { announcementId, shard } = job.data as { announcementId: string; shard: string };
      const pool = shards[shard];
      if (!pool) throw new Error(`unknown-shard:${shard}`);
      const a = await catalog.query("SELECT title, body FROM announcements WHERE announcement_id = $1", [announcementId]);
      if (a.rows.length === 0) return { skipped: true };
      const { title, body } = a.rows[0] as { title: string; body: string };
      const { map } = await loadActiveMap(catalog);
      const buckets: number[] = [];
      for (const [bucket, owner] of map) if (owner === shard) buckets.push(bucket);
      if (buckets.length === 0) return { shard, delivered: 0, emailed: 0 };
      const emps = await pool.query("SELECT employee_id, bucket_id, email FROM employees WHERE status = 'ACTIVE' AND bucket_id = ANY($1)", [buckets]);
      const prefsRows = await catalog.query(
        "SELECT u.email_norm, COALESCE(p.in_app_enabled, TRUE) AS in_app_enabled, COALESCE(p.email_enabled, TRUE) AS email_enabled FROM users u LEFT JOIN notification_prefs p ON p.user_id = u.user_id WHERE u.email_norm = ANY($1)",
        [emps.rows.map((e) => (e as { email: string }).email.trim().toLowerCase())]
      );
      const prefsByEmail = new Map((prefsRows.rows as Array<{ email_norm: string; in_app_enabled: boolean; email_enabled: boolean }>).map((r) => [r.email_norm, r]));
      let delivered = 0;
      const emailTargets: string[] = [];
      for (const emp of emps.rows as Array<{ employee_id: string; bucket_id: number; email: string }>) {
        const prefs = prefsByEmail.get(emp.email.trim().toLowerCase()) ?? { in_app_enabled: true, email_enabled: true };
        if (prefs.in_app_enabled) {
          const ins = await pool.query(
            "INSERT INTO notifications (notification_id, employee_id, bucket_id, kind, title, body, source_ref) VALUES ($1,$2,$3,'ANNOUNCEMENT',$4,$5,$6) ON CONFLICT DO NOTHING",
            [`${announcementId}:${emp.employee_id}`, emp.employee_id, emp.bucket_id, title, body, announcementId]
          );
          delivered += ins.rowCount ?? 0;
        }
        if (prefs.email_enabled) emailTargets.push(emp.email);
      }
      // Send the e-mails after the inserts so a large fan-out does not delay
      // the in-app rows; batches keep the local SMTP hop concurrency bounded.
      for (let i = 0; i < emailTargets.length; i += 8) {
        await Promise.all(
          emailTargets.slice(i, i + 8).map((to) =>
            mailer.sendMail({ from: "HRMS <no-reply@hrms.local>", to, subject: `HRMS: ${title}`, text: body })
          )
        );
      }
      return { shard, delivered, emailed: emailTargets.length };
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
