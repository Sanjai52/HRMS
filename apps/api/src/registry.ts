import { randomUUID } from "node:crypto";
import { GateClosedError, registrationValid } from "@hrms/core";
import { catalogPool } from "./db/pools.js";

const HEARTBEAT_MS = 5000;
const TTL_MS = Number(process.env.REGISTRY_TTL_MS ?? 30000);
const MARGIN_MS = Number(process.env.REGISTRY_MARGIN_MS ?? 10000);

let processId: string | null = null;
let kind = "API";
let timer: ReturnType<typeof setInterval> | null = null;
// Monotonic time of the last heartbeat that reached the registry. Writes are
// refused once `TTL_MS - MARGIN_MS` has passed since this moment (D-002).
let lastSentMono: number | null = null;

function nowMono(): number {
  return Number(process.hrtime.bigint() / 1000000n);
}

export class RegistrationExpiredError extends GateClosedError {
  constructor() {
    super(0);
    this.message = "registration-expired";
  }
}

export function registryId(): string | null {
  return processId;
}

/** Introspection for tests and diagnostics. */
export function registrationState(): {
  processId: string | null;
  lastSentMonoMs: number | null;
  ttlMs: number;
  marginMs: number;
  valid: boolean;
} {
  return { processId, lastSentMonoMs: lastSentMono, ttlMs: TTL_MS, marginMs: MARGIN_MS, valid: registrationValid(lastSentMono, nowMono(), TTL_MS, MARGIN_MS) };
}

export function assertRegistrationValid(): void {
  if (!registrationValid(lastSentMono, nowMono(), TTL_MS, MARGIN_MS)) throw new RegistrationExpiredError();
}

export async function registerProcess(processKind: string, owner: string): Promise<void> {
  kind = processKind;
  processId = `${processKind.toLowerCase()}:${owner}:${randomUUID().slice(0, 8)}`;
  const gate = await catalogPool.query("SELECT epoch, state FROM catalog_write_gate WHERE id = 1");
  const map = await catalogPool.query("SELECT version FROM routing_map_versions WHERE domain = 'employee' AND active = TRUE");
  await catalogPool.query(
    "INSERT INTO process_registry (process_id, kind, owner, heartbeat_at, expires_at, map_version_loaded, gate_epoch_ack, gate_epoch, gate_state) VALUES ($1,$2,$3,now(), now() + make_interval(secs => $7), $4, $5, $5, $6) ON CONFLICT (process_id) DO UPDATE SET heartbeat_at = now(), expires_at = now() + make_interval(secs => $7)",
    [processId, kind, owner, (map.rows[0] as { version: number } | undefined)?.version ?? 1, (gate.rows[0] as { epoch: number } | undefined)?.epoch ?? 0, (gate.rows[0] as { state: string } | undefined)?.state ?? "OPEN", TTL_MS / 1000]
  );
  lastSentMono = nowMono();
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
      [processId, (map.rows[0] as { version: number } | undefined)?.version ?? 1, (gate.rows[0] as { epoch: number } | undefined)?.epoch ?? 0, (gate.rows[0] as { state: string } | undefined)?.state ?? "OPEN", TTL_MS / 1000]
    );
    // Only a send that reached the registry extends the local deadline; a failed
    // heartbeat must let it expire so writes stop ~20 s later.
    lastSentMono = nowMono();
  } catch {
    // registry unreachable: the local monotonic deadline stops writes (D-002)
  }
}
