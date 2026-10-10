import { catalogPool } from "./db/pools.js";
import { createIdIssuer, LeaseExpiredError, type IdIssuer } from "@hrms/core";

let issuer: IdIssuer | null = null;

export async function initIds(owner: string): Promise<void> {
  issuer = await createIdIssuer(catalogPool, owner);
}

export function nextEventId(): string {
  if (!issuer) throw new LeaseExpiredError();
  return issuer.next();
}
