import {
  prefixesFor,
  suggestKey,
  suggestMember,
  AUTOCOMPLETE_TOP_K,
} from "./autocomplete.js";
import { stableEmployeeBucket } from "./bucket.js";
import type { PoolLike, Queryable } from "./shard-router.js";

export interface SortedSet {
  zadd(key: string, score: string, member: string): Promise<unknown>;
  zrange(key: string, start: string, stop: string): Promise<string[]>;
  zrem(key: string, ...members: string[]): Promise<unknown>;
  zremrangebyrank(key: string, start: number, stop: number): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
}

export interface DispatcherHandles {
  catalog: Queryable;
  shards: Record<string, PoolLike>;
  redis: SortedSet;
  map?: Map<number, string>;
  enqueue?(name: string, data: unknown, opts?: { jobId?: string }): Promise<unknown>;
}

export interface DispatchCounts {
  delivered: number;
  failed: number;
}

async function indexAutocomplete(
  redis: SortedSet,
  employeeId: string,
  name: string,
  email: string,
  department: string
): Promise<void> {
  const member = suggestMember(employeeId, name, department);
  const prefixes = new Set([...prefixesFor(name), ...prefixesFor(email)]);
  const score = Date.now();
  for (const prefix of prefixes) {
    const key = suggestKey(prefix);
    await redis.zadd(key, score.toString(), member);
    await redis.zremrangebyrank(key, 0, -(AUTOCOMPLETE_TOP_K + 1));
    await redis.expire(key, 7 * 24 * 3600);
  }
}

async function removeAutocomplete(redis: SortedSet, employeeId: string, name: string, email: string): Promise<void> {
  const prefixes = new Set([...prefixesFor(name), ...prefixesFor(email)]);
  for (const prefix of prefixes) {
    const key = suggestKey(prefix);
    const members = await redis.zrange(key, "0", "-1");
    const doomed = members.filter((m) => m.split("|")[0] === employeeId);
    if (doomed.length > 0) await redis.zrem(key, ...doomed);
  }
}

async function applyEvent(
  handles: DispatcherHandles,
  event: { event_id: string; employee_id: string; type: string; payload: Record<string, unknown>; version: number }
): Promise<void> {
  const p = event.payload;
  const name = typeof p.name === "string" ? p.name : "";
  const email = typeof p.email === "string" ? p.email : "";
  const department = typeof p.department === "string" ? p.department : "";
  const designation = typeof p.designation === "string" ? p.designation : "";

  switch (event.type) {
    case "EMPLOYEE_CREATED":
    case "EMPLOYEE_UPDATED": {
      await handles.catalog.query(
        `INSERT INTO employee_directory (employee_id, email, email_norm, name, department, designation, status, version)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7)
         ON CONFLICT (employee_id) DO UPDATE SET
           email = EXCLUDED.email, email_norm = EXCLUDED.email_norm, name = EXCLUDED.name,
           department = EXCLUDED.department, designation = EXCLUDED.designation,
           status = 'ACTIVE', version = EXCLUDED.version, updated_at = now()
         WHERE employee_directory.version < EXCLUDED.version`,
        [event.employee_id, email, email.toLowerCase(), name, department, designation, event.version]
      );
      await indexAutocomplete(handles.redis, event.employee_id, name, email, department);
      break;
    }
    case "EMPLOYEE_DEACTIVATED": {
      await handles.catalog.query("DELETE FROM employee_directory WHERE employee_id = $1", [event.employee_id]);
      await removeAutocomplete(handles.redis, event.employee_id, name, email);
      break;
    }
    case "LEAVE_DECIDED": {
      const requestId = typeof p.requestId === "string" ? p.requestId : "";
      const status = typeof p.status === "string" ? p.status : "";
      const map = handles.map;
      if (!map) throw new Error("no-routing-map-for-notification");
      const bucket = stableEmployeeBucket(event.employee_id);
      const shard = map.get(bucket);
      const pool = shard ? handles.shards[shard] : undefined;
      if (!pool) throw new Error(`no-shard-for-notification:${bucket}`);
      const title = status === "APPROVED" ? "Leave approved" : status === "REJECTED" ? "Leave rejected" : `Leave ${status.toLowerCase()}`;
      const nclient = await pool.connect();
      try {
        await nclient.query(
          "INSERT INTO notifications (notification_id, employee_id, bucket_id, kind, title, body) VALUES ($1, $2, $3, 'leave', $4, $5) ON CONFLICT DO NOTHING",
          [event.event_id, event.employee_id, bucket, title, `Request ${requestId} is now ${status}.`]
        );
      } finally {
        nclient.release();
      }
      if (handles.enqueue) {
        // BullMQ rejects custom ids that parse back to themselves as integers
        // ("Custom Id cannot be integers"); outbox event ids are snowflakes.
        // The prefix keeps a stable per-event id for BullMQ dedupe.
        await handles.enqueue("notification", { notificationId: event.event_id, employeeId: event.employee_id, shard }, { jobId: `notify-${event.event_id}` });
      }
      break;
    }
    case "REVIEW_RELEASED": {
      const map = handles.map;
      if (!map) throw new Error("no-routing-map-for-notification");
      const bucket = stableEmployeeBucket(event.employee_id);
      const shard = map.get(bucket);
      const pool = shard ? handles.shards[shard] : undefined;
      if (!pool) throw new Error(`no-shard-for-notification:${bucket}`);
      const nclient = await pool.connect();
      try {
        await nclient.query(
          "INSERT INTO notifications (notification_id, employee_id, bucket_id, kind, title, body) VALUES ($1, $2, $3, 'performance', 'Review released', $4) ON CONFLICT DO NOTHING",
          [event.event_id, event.employee_id, bucket, "Your performance review is ready to view."]
        );
      } finally {
        nclient.release();
      }
      break;
    }
    case "AUDIT": {
      await handles.catalog.query(
        "INSERT INTO audit_logs (event_id, actor, action, resource, metadata) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
        [event.event_id, (p.actor as string) ?? "", (p.action as string) ?? "", (p.resource as string) ?? "", JSON.stringify(p)]
      );
      break;
    }
    default:
      throw new Error(`unknown-event-type:${event.type}`);
  }
}
export async function runDispatcherOnce(handles: DispatcherHandles): Promise<DispatchCounts> {
  let delivered = 0;
  let failed = 0;
  async function drain(table: string, idCol: string, ownerCol: string, bucketCol: string, versionExpr: string): Promise<void> {
    for (const pool of Object.values(handles.shards)) {
      const client = await pool.connect();
      try {
        const r = await client.query(
          `SELECT event_id, ${ownerCol} AS employee_id, ${bucketCol} AS bucket_id, type, payload, ${versionExpr} AS version, attempts FROM ${table} WHERE delivered_at IS NULL AND attempts < 10 ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED`
        );
        for (const row of r.rows as Array<{ event_id: string; employee_id: string; type: string; payload: Record<string, unknown>; version: number }>) {
          try {
            await applyEvent(handles, row);
            await client.query(`UPDATE ${table} SET delivered_at = now() WHERE ${idCol} = $1`, [row.event_id]);
            delivered += 1;
          } catch (e) {
            failed += 1;
            await client.query(`UPDATE ${table} SET attempts = attempts + 1, last_error = $2 WHERE ${idCol} = $1`, [
              row.event_id,
              String((e as Error).message ?? e).slice(0, 500),
            ]);
          }
        }
      } finally {
        client.release();
      }
    }
  }
  await drain("outbox_events", "event_id", "employee_id", "bucket_id", "COALESCE(version, 1)");
  await drain("candidate_outbox", "event_id", "candidate_id", "candidate_bucket_id", "1");
  return { delivered, failed };
}
