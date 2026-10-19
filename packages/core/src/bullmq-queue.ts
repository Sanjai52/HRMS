import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { JobName, JobQueue } from "./queue.js";

export class BullMqJobQueue implements JobQueue {
  private queue: Queue;
  private connection: Redis;

  constructor(redisUrl: string, queueName = "hrms") {
    // Producer connection: retries and timeouts stay finite so enqueue calls
    // reject promptly while the queue is down (the caller maps that to 502 and
    // fails the batch) instead of hanging until redis returns.
    // - connectTimeout bounds TCP connect attempts.
    // - commandTimeout bounds commands that may never be answered (e.g. a
    //   port proxy that accepts the connection but black-holes the protocol).
    // - skipWaitingForReady is required on top: BullMQ otherwise awaits the
    //   connection's 'ready' event indefinitely (RedisConnection.waitUntilReady)
    //   and the finite-retry rejection is never reached.
    // Worker consumers keep maxRetriesPerRequest: null — blocking commands need it.
    this.connection = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 2000,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    this.queue = new Queue(queueName, { connection: this.connection, skipWaitingForReady: true });
    this.queue.on("error", (err) => console.error(`queue error: ${(err as Error).message}`));
  }

  async enqueue<T>(name: JobName, data: T, opts?: { jobId?: string }): Promise<{ jobId: string }> {
    const job = await this.queue.add(name, data as object, {
      jobId: opts?.jobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
    return { jobId: job.id ?? "" };
  }

  async close(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
