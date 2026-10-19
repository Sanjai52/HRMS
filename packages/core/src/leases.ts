import { Snowflake, acquireWorkerLease, renewWorkerLease, LeaseExpiredError, WORKER_LEASE_RENEW_MS } from "./snowflake.js";
import type { Queryable } from "./shard-router.js";

export interface IdIssuer {
  next(): string;
  workerId(): number;
  stop(): void;
}

export async function createIdIssuer(catalog: Queryable, owner: string): Promise<IdIssuer> {
  const lease = await acquireWorkerLease(catalog, owner);
  const snowflake = new Snowflake(lease.workerId);
  let validUntil = lease.leaseValidUntil;
  const timer = setInterval(async () => {
    try {
      validUntil = await renewWorkerLease(catalog, lease.workerId, owner);
    } catch {
      // D-003: the local window is last-successful-renewal + TTL − margin
      // (~45 s); it is not cut short by a failed attempt. The 15 s margin
      // before the DB lease expires keeps a reclaimer from overlapping, and
      // the D-002 registration deadline (~20 s) is what stops shard writes
      // earlier. `next()` still fails closed once the window lapses.
    }
  }, WORKER_LEASE_RENEW_MS);
  timer.unref?.();
  return {
    next(): string {
      if (Date.now() > validUntil) throw new LeaseExpiredError();
      return snowflake.next(validUntil);
    },
    workerId(): number {
      return lease.workerId;
    },
    stop(): void {
      clearInterval(timer);
    },
  };
}
