import { randomUUID } from "node:crypto";
import { catalogPool } from "./db/pools.js";

const HEARTBEAT_MS = 5000;
const TTL_S = 30;

let processId: string | null = null;
let kind = "API";
let timer: ReturnType<typeof setInterval> | null = null;

export function registryId(): string | null {
  return processId;
}

export async function registerProcess(processKind: string, owner: string): Promise<void> {
  kind = processKind;
  processId = `${processKind.toLowerCase()}:${owner}:${randomUUID().slice(0, 8)}`;
  const gate = await catalogPool.query("SELECT epoch, state FROM catalog_write_gate WHERE id = 1");
  const map = await catalogPool.query("SELECT version FROM routing_map_versions WHERE domain = 'employee' AND active = TRUE");
  await catalogPool.query(
    "INSERT INTO process_registry (process_id, kind, owner, heartbeat_at, expires_at, map_version_loaded, gate_epoch_ack, gate_epoch, gate_state) VALUES ($1,$2,$3,now(), now() + make_interval(secs => 30), $4, $5, $5, $6) ON CONFLICT (process_id) DO UPDATE SET heartbeat_at = now(), expires_at = now() + make_interval(secs => 30)",
    [processId, kind, owner, (map.rows[0] as { version: number } | undefined)?.version ?? 1, (gate.rows[0] as { epoch: number } | undefined)?.epoch ?? 0, (gate.rows[0] as { state: string } | undefined)?.state ?? "OPEN"]
  );
  if (timer) clearInterval(timer);
  timer = setInterval(heartbeat, HEARTBEAT_MS);
  timer.unref?.();
}

async function heartbeat(): Promise<void> {
  if (!processId) return;
  try {
    const gate = await catalogPool.query("SELECT epoch, state FROM catalog_write_gate WHERE id = 1");
    const map = await catalogPool.query("SELECT version FROM routing_map_versions WHERE domain = 'employee' AND active = TRUE");
    await catalogPool.query(
      "UPDATE process_registry SET heartbeat_at = now(), expires_at = now() + make_interval(secs => $5), map_version_loaded = $2, gate_epoch_ack = $3, gate_epoch = $3, gate_state = $4 WHERE process_id = $1",
      [processId, (map.rows[0] as { version: number } | undefined)?.version ?? 1, (gate.rows[0] as { epoch: number } | undefined)?.epoch ?? 0, (gate.rows[0] as { state: string } | undefined)?.state ?? "OPEN", TTL_S]
    );
  } catch {
    // registry unreachable: writes keep working until the local monotonic deadline (checked by the migrator, not per-write)
  }
}
