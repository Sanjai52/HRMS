import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { JobName, JobQueue } from "./queue.js";

export class BullMqJobQueue implements JobQueue {
  private queue: Queue;
  private connection: Redis;

  constructor(redisUrl: string, queueName = "hrms") {
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(queueName, { connection: this.connection });
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
