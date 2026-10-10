import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export interface AuditEvent {
  actor: string;
  action: string;
  resource: string;
  metadata?: Record<string, unknown>;
  eventId?: string;
}

export async function writeAudit(
  db: { query(text: string, params?: unknown[]): Promise<unknown> },
  event: AuditEvent
): Promise<string> {
  const eventId = event.eventId ?? randomUUID();
  await db.query(
    "INSERT INTO audit_logs (event_id, actor, action, resource, metadata) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
    [eventId, event.actor, event.action, event.resource, JSON.stringify(event.metadata ?? {})]
  );
  return eventId;
}

export type { Pool };
