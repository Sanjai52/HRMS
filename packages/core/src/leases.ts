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
      validUntil = 0;
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
