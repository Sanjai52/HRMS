import { errorEnvelope } from "@hrms/core";

export class CatalogGateError extends Error {
  constructor() {
    super("catalog-gated");
  }
}

export async function assertCatalogOpen(db: { query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> }): Promise<void> {
  const r = await db.query("SELECT state FROM catalog_write_gate WHERE id = 1");
  if ((r.rows[0] as { state: string } | undefined)?.state === "GATED") throw new CatalogGateError();
}

export function gateError(res: import("express").Response): void {
  res.status(503).json(errorEnvelope("GATE_CLOSED", "Writes are paused for maintenance. Try again shortly."));
}
