import { loadActiveMap, resolveShard, type ActiveMap, type Queryable } from "./shard-router.js";

/**
 * In-process routing + identity snapshot (D-002).
 *
 * Refreshed from the registry heartbeat while the catalog is healthy. When the
 * catalog goes away, eligible shard-local operations keep resolving from the
 * last snapshot; how long that stale snapshot may be trusted is bounded by the
 * registry's local deadline (~20 s with default TTL/margin), which the fence in
 * front of every shard write enforces independently.
 */
export class RoutingCache {
  private activeMap: { version: number; map: ActiveMap } | null = null;
  private identity: Map<string, string> | null = null;

  constructor(private readonly catalog: Queryable) {}

  /** Diagnostics for tests and health endpoints. */
  state(): { mapVersion: number | null; identitySize: number } {
    return { mapVersion: this.activeMap?.version ?? null, identitySize: this.identity?.size ?? 0 };
  }

  /**
   * Reload the map and the user→employee identity from the catalog. Throws when
   * the catalog is unreachable; callers keep the previous snapshot in that case.
   */
  async refresh(): Promise<void> {
    const { version, map } = await loadActiveMap(this.catalog);
    const identity = await this.loadIdentity();
    this.activeMap = { version, map };
    this.identity = identity;
  }

  /** Shard owning `employeeId`, from the snapshot (lazy-loads once when empty). */
  async shardOf(employeeId: string): Promise<string> {
    if (!this.activeMap) {
      const { version, map } = await loadActiveMap(this.catalog);
      this.activeMap = { version, map };
    }
    return resolveShard(employeeId, this.activeMap.map);
  }

  /** employee_id for a user id, from the snapshot (lazy-loads once when empty). */
  async employeeIdOf(userId: string): Promise<string | null> {
    if (!this.identity) this.identity = await this.loadIdentity();
    return this.identity.get(userId) ?? null;
  }

  private async loadIdentity(): Promise<Map<string, string>> {
    const rows = await this.catalog.query(
      "SELECT u.user_id, d.employee_id FROM users u JOIN employee_directory d ON d.email_norm = u.email_norm"
    );
    const identity = new Map<string, string>();
    for (const row of rows.rows) identity.set(row.user_id as string, row.employee_id as string);
    return identity;
  }
}
