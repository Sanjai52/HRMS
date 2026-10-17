import { withFencedWrite, type PoolClientLike, type PoolLike } from "@hrms/core";
import { assertRegistrationValid } from "./registry.js";

/**
 * Fenced shard write with the local registry deadline in front of it (D-002):
 * state-changing work stops ~20 s after the last heartbeat send that reached
 * the registry, even while the shard itself still answers. Expiry throws a
 * `RegistrationExpiredError extends GateClosedError`, so existing route
 * catches keep returning `503 GATE_CLOSED` ("retry shortly") unchanged.
 */
export async function fencedWrite<T>(pool: PoolLike, fn: (client: PoolClientLike) => Promise<T>): Promise<T> {
  assertRegistrationValid();
  return withFencedWrite(pool, fn);
}
