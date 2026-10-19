import { describe, it, expect } from "vitest";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { runDispatcherOnce, type DispatcherHandles, type SortedSet } from "../src/dispatcher.js";
import { stableEmployeeBucket } from "../src/bucket.js";
import type { PoolClientLike } from "../src/shard-router.js";

// Snowflake-shaped (all-digit) event ids are what the outbox stores; BullMQ
// rejects a custom job id when `${parseInt(id, 10)}` === id ("Custom Id cannot
// be integers"), which is why the dispatcher must not pass the raw event id.
const EMPLOYEE = "11111111-1111-1111-1111-111111111111";
const EVENT_ID = "104847374962135040";

class FakeShardPool {
  queries: Array<{ text: string; values?: unknown[] }> = [];
  constructor(private row: Record<string, unknown> | null) {}
  async connect(): Promise<PoolClientLike> {
    return {
      query: async (text: string, values?: unknown[]) => {
        this.queries.push({ text, values });
        if (text.includes("FROM outbox_events")) return { rows: this.row ? [this.row] : [] };
        return { rows: [] };
      },
      release: () => undefined,
    };
  }
}

function leaveDecidedRow(eventId = EVENT_ID): Record<string, unknown> {
  return {
    event_id: eventId,
    employee_id: EMPLOYEE,
    bucket_id: stableEmployeeBucket(EMPLOYEE),
    type: "LEAVE_DECIDED",
    payload: { requestId: "req-1", status: "APPROVED" },
    version: 1,
    attempts: 10,
  };
}

const redisStub: SortedSet = {
  zadd: async () => 0,
  zrange: async () => [],
  zrem: async () => 0,
  zremrangebyrank: async () => 0,
  expire: async () => 1,
};

function handlesWith(
  row: Record<string, unknown> | null,
  enqueue: NonNullable<DispatcherHandles["enqueue"]>
): DispatcherHandles {
  return {
    catalog: { query: async () => ({ rows: [] }) },
    shards: { "shard-test": new FakeShardPool(row) },
    redis: redisStub,
    map: new Map([[stableEmployeeBucket(EMPLOYEE), "shard-test"]]),
    enqueue,
  };
}

describe("runDispatcherOnce LEAVE_DECIDED notification enqueue", () => {
  it("uses a prefixed string job id that BullMQ accepts (numeric ids are rejected)", async () => {
    const captured: Array<{ name: string; data: unknown; opts?: { jobId?: string } }> = [];
    const counts = await runDispatcherOnce(
      handlesWith(leaveDecidedRow(), async (name, data, opts) => {
        captured.push({ name, data, opts });
        return {};
      })
    );

    expect(counts).toEqual({ delivered: 1, failed: 0 });
    expect(captured).toHaveLength(1);
    expect(captured[0].name).toBe("notification");
    const jobId = captured[0].opts?.jobId ?? "";
    expect(jobId).toBe(`notify-${EVENT_ID}`);
    // BullMQ's own acceptance predicate (job.js: `${parseInt(jobId,10)} === jobId` rejects).
    expect(String(parseInt(jobId, 10))).not.toBe(jobId);
  });

  it("keeps dedupe semantics: same event -> same id, distinct events -> distinct ids", async () => {
    const ids: string[] = [];
    const enqueue: NonNullable<DispatcherHandles["enqueue"]> = async (_name, _data, opts) => {
      ids.push(opts?.jobId ?? "");
      return {};
    };
    await runDispatcherOnce(handlesWith(leaveDecidedRow(), enqueue));
    await runDispatcherOnce(handlesWith(leaveDecidedRow(), enqueue));
    await runDispatcherOnce(handlesWith(leaveDecidedRow("104847374962135041"), enqueue));

    expect(ids[0]).toBe(`notify-${EVENT_ID}`);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).toBe("notify-104847374962135041");
    expect(new Set(ids).size).toBe(2);
  });

  it("counts the event failed (not delivered) when the enqueue rejects", async () => {
    const counts = await runDispatcherOnce(
      handlesWith(leaveDecidedRow(), async () => {
        throw new Error("Custom Id cannot be integers");
      })
    );
    expect(counts).toEqual({ delivered: 0, failed: 1 });
  });
});

// Live check: the dispatcher's generated id must survive a real BullMQ add.
// REDIS_LIVE=1 enables (needs the docker redis-queue on 6379).
const url = process.env.REDIS_QUEUE_URL ?? "redis://localhost:6379";
const describeLive = process.env.REDIS_LIVE ? describe : describe.skip;

describeLive("runDispatcherOnce against a live BullMQ queue", () => {
  it("enqueues a LEAVE_DECIDED notification job with the prefixed id", async () => {
    const eventId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const connection = new Redis(url, { maxRetriesPerRequest: null });
    const queue = new Queue("core-dispatcher-test", { connection });
    const captured: string[] = [];
    try {
      const counts = await runDispatcherOnce(
        handlesWith(leaveDecidedRow(eventId), async (name, data, opts) => {
          captured.push(opts?.jobId ?? "");
          return queue.add(name, data as object, { jobId: opts?.jobId, attempts: 3, removeOnComplete: 100 });
        })
      );
      expect(counts).toEqual({ delivered: 1, failed: 0 });
      expect(captured).toEqual([`notify-${eventId}`]);
      const job = await queue.getJob(`notify-${eventId}`);
      expect(job?.id).toBe(`notify-${eventId}`);
      await job?.remove();
    } finally {
      await queue.close();
      connection.disconnect();
    }
  }, 20_000);

  it("pins the diagnosis: BullMQ rejects the raw numeric event id", async () => {
    const connection = new Redis(url, { maxRetriesPerRequest: null });
    const queue = new Queue("core-dispatcher-test", { connection });
    try {
      await expect(queue.add("notification", {}, { jobId: EVENT_ID })).rejects.toThrow("Custom Id cannot be integers");
    } finally {
      await queue.close();
      connection.disconnect();
    }
  }, 20_000);
});
