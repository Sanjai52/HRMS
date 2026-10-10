import { catalogPool } from "./db/pools.js";
import { acquireWorkerLease, renewWorkerLease, Snowflake, LeaseExpiredError, WORKER_LEASE_RENEW_MS } from "@hrms/core";

interface Holder {
  workerId: number;
  validUntil: number;
  snowflake: Snowflake;
  timer: ReturnType<typeof setInterval> | null;
}

const holder: Holder = { workerId: -1, validUntil: 0, snowflake: new Snowflake(0, () => 0), timer: null };

export async function initIds(owner: string): Promise<void> {
  const lease = await acquireWorkerLease(catalogPool, owner);
  holder.workerId = lease.workerId;
  holder.validUntil = lease.leaseValidUntil;
  holder.snowflake = new Snowflake(lease.workerId);
  if (holder.timer) clearInterval(holder.timer);
  holder.timer = setInterval(async () => {
    try {
      holder.validUntil = await renewWorkerLease(catalogPool, holder.workerId, owner);
    } catch {
      holder.validUntil = 0;
    }
  }, WORKER_LEASE_RENEW_MS);
  holder.timer.unref?.();
}

export function nextEventId(): string {
  if (holder.workerId < 0 || Date.now() > holder.validUntil) throw new LeaseExpiredError();
  return holder.snowflake.next(holder.validUntil);
}
