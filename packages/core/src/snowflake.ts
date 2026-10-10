export const SNOWFLAKE_EPOCH = Date.UTC(2026, 0, 1);

const WORKER_BITS = 10n;
const SEQUENCE_BITS = 12n;
const MAX_SEQUENCE = Number((1n << SEQUENCE_BITS) - 1n);
const MAX_WORKER = Number((1n << WORKER_BITS) - 1n);

export class ClockBackwardError extends Error {
  constructor() {
    super("clock moved backward: refusing to generate");
  }
}

export class LeaseExpiredError extends Error {
  constructor() {
    super("worker-id lease expired: refusing to generate");
  }
}

export interface Lease {
  workerId: number;
  expiresAt: number;
}

export class Snowflake {
  private lastMs = -1;
  private sequence = 0;

  constructor(private workerId: number, private now: () => number = Date.now) {
    if (workerId < 0 || workerId > MAX_WORKER) throw new Error(`worker-id out of range: ${workerId}`);
  }

  next(leaseValidUntil?: number): string {
    if (leaseValidUntil !== undefined && this.now() > leaseValidUntil) throw new LeaseExpiredError();
    let ms = this.now();
    if (ms < this.lastMs) throw new ClockBackwardError();
    if (ms === this.lastMs) {
      this.sequence += 1;
      if (this.sequence > MAX_SEQUENCE) {
        while (this.now() <= this.lastMs) {
          // busy-wait for next millisecond (bounded by clock progress)
        }
        ms = this.now();
        this.sequence = 0;
      }
    } else {
      this.sequence = 0;
    }
    this.lastMs = ms;
    const id = ((BigInt(ms - SNOWFLAKE_EPOCH) << (WORKER_BITS + SEQUENCE_BITS)) |
      (BigInt(this.workerId) << SEQUENCE_BITS) |
      BigInt(this.sequence)) &
      ((1n << 63n) - 1n);
    return id.toString();
  }
}

export const WORKER_LEASE_TTL_MS = 60_000;
export const WORKER_LEASE_RENEW_MS = 10_000;
export const WORKER_LEASE_MARGIN_MS = 15_000;

export async function acquireWorkerLease(
  catalog: { query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> },
  owner: string
): Promise<{ workerId: number; leaseValidUntil: number }> {
  for (let id = 0; id <= MAX_WORKER; id++) {
    const r = await catalog.query(
      "INSERT INTO worker_id_leases (worker_id, owner, heartbeat_at, expires_at) VALUES ($1, $2, now(), now() + make_interval(secs => 60)) ON CONFLICT (worker_id) DO NOTHING RETURNING worker_id",
      [id, owner]
    );
    if (r.rows.length > 0) {
      return { workerId: id, leaseValidUntil: Date.now() + WORKER_LEASE_TTL_MS - WORKER_LEASE_MARGIN_MS };
    }
    const taken = await catalog.query("SELECT owner, expires_at FROM worker_id_leases WHERE worker_id = $1", [id]);
    const row = taken.rows[0] as { owner: string; expires_at: string } | undefined;
    if (row && new Date(row.expires_at).getTime() < Date.now()) {
      const claimed = await catalog.query(
        "UPDATE worker_id_leases SET owner = $2, heartbeat_at = now(), expires_at = now() + make_interval(secs => 60) WHERE worker_id = $1 AND expires_at < now() RETURNING worker_id",
        [id, owner]
      );
      if (claimed.rows.length > 0) {
        return { workerId: id, leaseValidUntil: Date.now() + WORKER_LEASE_TTL_MS - WORKER_LEASE_MARGIN_MS };
      }
    }
  }
  throw new Error("no worker-id available");
}

export async function renewWorkerLease(
  catalog: { query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> },
  workerId: number,
  owner: string
): Promise<number> {
  const r = await catalog.query(
    "UPDATE worker_id_leases SET heartbeat_at = now(), expires_at = now() + make_interval(secs => 60) WHERE worker_id = $1 AND owner = $2 RETURNING worker_id",
    [workerId, owner]
  );
  if (r.rows.length === 0) throw new LeaseExpiredError();
  return Date.now() + WORKER_LEASE_TTL_MS - WORKER_LEASE_MARGIN_MS;
}
