"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { Button, Card, SkeletonRows, StatusPill } from "../../../components/ui";
import { authed } from "../../../lib/hr";

interface ShardInfo {
  versions: Array<{ version: number; domain: string; members: string; active: boolean }>;
  gates: Record<string, { state: string; epoch?: number; employees?: string }>;
  registry: Array<{ process_id: string; kind: string; owner: string; heartbeat_at: string; map_version_loaded: number; gate_epoch_ack: string; gate_state: string }>;
  runs: Array<{ run_id: string; new_shard: string; state: string; current_step: string; created_at: string }>;
}

export default function ShardsPage() {
  const [info, setInfo] = useState<ShardInfo | null>(null);
  const [preview, setPreview] = useState<{ moves: number; estimatedRows: number; toVersion: number } | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runState, setRunState] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      setInfo(await authed<ShardInfo>("/api/v1/admin/shards"));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!runId) return;
    let stop = false;
    const t = setInterval(async () => {
      try {
        const r = await authed<{ state: string; current_step: string; error: string }>(`/api/v1/admin/shards/runs/${runId}`);
        if (!stop) {
          setRunState(`${r.state} · ${r.current_step}${r.error ? ` · ${r.error}` : ""}`);
          if (["COMPLETED", "ABORTED", "FAILED"].includes(r.state)) {
            clearInterval(t);
            await load();
          }
        }
      } catch {
        // keep polling
      }
    }, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [runId]);

  async function doPreview() {
    setError("");
    try {
      setPreview(await authed("/api/v1/admin/shards/preview", undefined, { method: "POST", body: JSON.stringify({ newShard: "shard-4" }) }));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function doMigrate() {
    if (!window.confirm("Add shard-4 to the active ring? Writes pause while data moves.")) return;
    setError("");
    try {
      const out = await authed<{ runId: string }>("/api/v1/admin/shards/migrate", undefined, { method: "POST", body: JSON.stringify({ newShard: "shard-4" }) });
      setRunId(out.runId);
      setRunState("starting…");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const empVersions = (info?.versions ?? []).filter((v) => v.domain === "employee");
  const activeMembers = empVersions.find((v) => v.active)?.members.split(",") ?? [];
  const canAdd = !activeMembers.includes("shard-4");

  return (
    <AppShell title="Database shards">
      {!info && !error && <SkeletonRows n={4} />}
      {error && !info && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Restricted area</p>
          <p className="mt-1 text-sm text-foggy">{error}</p>
          <Button variant="quiet" onClick={load} className="mt-4 h-10 px-5 text-sm">
            Try again
          </Button>
        </Card>
      )}
      {info && (
        <div className="grid max-w-4xl gap-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-hof">Ring members</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeMembers.map((m) => (
                <span key={m} className="rounded-full bg-rausch/10 px-3 py-1.5 text-[13px] font-semibold text-rausch-dark">{m} · active</span>
              ))}
              {canAdd && (
                <span className="rounded-full bg-pearl px-3 py-1.5 text-[13px] font-semibold text-foggy">shard-4 · standby</span>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {canAdd && (
                <>
                  <Button onClick={doPreview}>Preview adding shard-4</Button>
                  <button onClick={doMigrate} className="inline-flex h-12 items-center rounded-full border border-hof px-6 text-[15px] font-semibold text-hof outline-none transition duration-200 hover:bg-pearl focus-visible:ring-2 focus-visible:ring-hof focus-visible:ring-offset-2 active:scale-[0.98]">
                    Add shard-4
                  </button>
                </>
              )}
            </div>
            {preview && (
              <p className="mt-3 text-sm tabular-nums text-hof">
                Version {preview.toVersion}: {preview.moves} buckets move, about {preview.estimatedRows} records to copy.
              </p>
            )}
            {runState && <p className="mt-3 text-sm font-semibold text-hof">Run: {runState}</p>}
            {error && (
              <p role="alert" className="mt-3 text-sm font-medium text-rausch-dark">
                {error}
              </p>
            )}
          </Card>

          <Card className="divide-y divide-line-soft">
            <h2 className="px-5 pt-5 text-lg font-semibold text-hof">Shard status</h2>
            {Object.entries(info.gates).map(([id, g]) => (
              <div key={id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <p className="min-w-0 flex-1 text-[15px] font-semibold text-hof">{id}</p>
                <p className="text-sm tabular-nums text-foggy">{g.employees ?? "?"} people</p>
                <StatusPill status={g.state} />
              </div>
            ))}
          </Card>

          <Card className="divide-y divide-line-soft">
            <h2 className="px-5 pt-5 text-lg font-semibold text-hof">Live processes</h2>
            {info.registry.length === 0 && <p className="px-5 py-4 text-sm text-foggy">None reporting.</p>}
            {info.registry.map((p) => (
              <div key={p.process_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <p className="min-w-0 flex-1 font-mono text-[13px] text-hof">{p.process_id}</p>
                <p className="text-[13px] tabular-nums text-foggy">map v{p.map_version_loaded} · {p.gate_state}</p>
              </div>
            ))}
          </Card>

          <Card className="divide-y divide-line-soft">
            <h2 className="px-5 pt-5 text-lg font-semibold text-hof">Recent migrations</h2>
            {info.runs.length === 0 && <p className="px-5 py-4 text-sm text-foggy">None yet.</p>}
            {info.runs.map((r) => (
              <div key={r.run_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <p className="min-w-0 flex-1 font-mono text-[13px] text-hof">{r.run_id.slice(0, 12)}… → {r.new_shard}</p>
                <StatusPill status={r.state} />
              </div>
            ))}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
