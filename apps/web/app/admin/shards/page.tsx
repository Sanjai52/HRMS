"use client";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { Alert, ErrorState } from "../../../components/feedback";
import { Button, Card, SkeletonRows, StatusPill, type StatusTone } from "../../../components/ui";
import { toUserMessage, type UserError } from "../../../lib/errors";
import { authed } from "../../../lib/hr";
import { fmtDateTime } from "../../../lib/format";

const NEW_SHARD = "shard-4";

interface ShardInfo {
  versions: Array<{ version: number; domain: string; members: string; active: boolean }>;
  gates: Record<string, { state: string; epoch?: number; employees?: string }>;
  registry: Array<{
    process_id: string;
    kind: string;
    owner: string;
    heartbeat_at: string;
    map_version_loaded: number;
    gate_epoch_ack: string;
    gate_state: string;
  }>;
  runs: Array<{ run_id: string; new_shard: string; state: string; current_step: string; created_at: string }>;
}

interface Preview {
  estimatedRows: number;
}

interface MigrationRun {
  state: string;
  current_step: string;
}

function shardLabel(key: string): string {
  const match = /^shard-(\d+)$/i.exec(key);
  if (!match) return "Database";
  const number = Number(match[1]);
  return number === 1 ? "Primary" : `Shard ${number}`;
}

function gateStatus(state: string): { label: string; tone: StatusTone } {
  switch ((state ?? "").toUpperCase()) {
    case "OPEN":
      return { label: "Accepting writes", tone: "success" };
    case "GATED":
      return { label: "Writes paused", tone: "warning" };
    case "UNREACHABLE":
      return { label: "Unreachable", tone: "danger" };
    default:
      return { label: "Status unavailable", tone: "neutral" };
  }
}

function migrationStatus(state: string): { label: string; tone: StatusTone } {
  switch ((state ?? "").toUpperCase()) {
    case "COMPLETED":
      return { label: "Completed", tone: "success" };
    case "FAILED":
      return { label: "Failed", tone: "danger" };
    case "ABORTED":
      return { label: "Stopped", tone: "neutral" };
    default:
      return { label: "In progress", tone: "info" };
  }
}

function processLabel(kind: string): string {
  if ((kind ?? "").toUpperCase() === "API") return "API process";
  if ((kind ?? "").toUpperCase() === "WORKER") return "Worker process";
  return "Service process";
}

function peopleLabel(value: string | undefined): string {
  const count = Number(value);
  if (value === undefined || !Number.isFinite(count)) return "Counts unavailable";
  return `${count.toLocaleString("en-IN")} ${count === 1 ? "person" : "people"}`;
}

function configStatus(state: string): { label: string; tone: StatusTone } {
  switch ((state ?? "").toUpperCase()) {
    case "OPEN":
      return { label: "Configuration up to date", tone: "success" };
    case "GATED":
      return { label: "Writes paused", tone: "warning" };
    default:
      return { label: "Configuration status unavailable", tone: "neutral" };
  }
}

const MIGRATION_SUCCESS_STATES = new Set(["CUTOVER_COMMITTED", "ACKED", "WRITES_RESUMED", "COMPLETED"]);

function migrationDestinationCopy(state: string, destination: string): string {
  const key = (state ?? "").toUpperCase();
  if (MIGRATION_SUCCESS_STATES.has(key)) return `Moved data to ${destination}`;
  if (key === "FAILED" || key === "ABORTED") return `Migration to ${destination} stopped before data finished moving`;
  return `Moving data to ${destination}`;
}

const RUN_TITLES: Record<string, string> = {
  STARTING: "Starting the migration",
  PREPARING: "Preparing the migration",
  GATED: "Writes paused while data moves",
  COPYING: "Copying records to the new database",
  VERIFYING: "Checking the copied records",
  CUTOVER_COMMITTED: "Switched to the new database",
  ACKED: "New database ready",
  WRITES_RESUMED: "Writes resumed",
  COMPLETED: "Migration complete",
  FAILED: "Migration stopped before completion",
  ABORTED: "Migration stopped",
};

const STEP_DETAILS: Record<string, string> = {
  prepare: "Preparing the database for the move.",
  gate: "New writes are paused while the move is prepared.",
  drain: "Waiting for pending writes to finish.",
  copy: "Copying employee records to the new database.",
  verify: "Checking that the copied records are complete.",
  cutover: "Switching traffic to the new database.",
  resume: "Resuming writes on the active databases.",
  done: "The new database is part of the active databases.",
  aborted: "The migration was stopped. No further changes are being made.",
  smoke_reverted: "The previous database configuration was restored.",
};

function describeRun(state: string, step: string): { title: string; detail: string } {
  const key = (state ?? "").toUpperCase();
  if (key === "FAILED") {
    return {
      title: RUN_TITLES.FAILED,
      detail: "Some records may not have moved. Contact your platform administrator.",
    };
  }
  return {
    title: RUN_TITLES[key] ?? "Migration in progress",
    detail: STEP_DETAILS[step] ?? "The database update is still running.",
  };
}

export default function ShardsPage() {
  const [info, setInfo] = useState<ShardInfo | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<UserError | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runProgress, setRunProgress] = useState<{ state: string; step: string } | null>(null);
  const [actionError, setActionError] = useState<UserError | null>(null);
  const [statusError, setStatusError] = useState<UserError | null>(null);
  const [pollError, setPollError] = useState<UserError | null>(null);
  const [pollTick, setPollTick] = useState(0);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      setInfo(await authed<ShardInfo>("/api/v1/admin/shards"));
      setState("ready");
    } catch (err) {
      setError(toUserMessage(err, "We couldn't load database status"));
      setState("error");
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setInfo(await authed<ShardInfo>("/api/v1/admin/shards"));
      setStatusError(null);
    } catch (err) {
      setStatusError(toUserMessage(err, "We couldn't load database status"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!runId) return;
    let stop = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const check = async () => {
      try {
        const run = await authed<MigrationRun>(`/api/v1/admin/shards/runs/${runId}`);
        if (stop) return;
        setPollError(null);
        setRunProgress({ state: run.state, step: run.current_step });
        if (["COMPLETED", "ABORTED", "FAILED"].includes(run.state)) {
          if (timer) clearInterval(timer);
          await refresh();
        }
      } catch (err) {
        if (!stop) setPollError(toUserMessage(err, "We couldn't check the migration progress"));
      }
    };

    void check();
    timer = setInterval(() => void check(), 3000);
    return () => {
      stop = true;
      if (timer) clearInterval(timer);
    };
  }, [runId, pollTick, refresh]);

  async function doPreview() {
    setActionError(null);
    try {
      setPreview(await authed<Preview>("/api/v1/admin/shards/preview", undefined, { method: "POST", body: JSON.stringify({ newShard: NEW_SHARD }) }));
    } catch (err) {
      setActionError(toUserMessage(err, "We couldn't start the migration"));
    }
  }

  async function doMigrate() {
    if (!window.confirm(`Add ${shardLabel(NEW_SHARD)} to the active databases? Data will move to the new database and writes will pause during the migration.`)) return;
    setActionError(null);
    setStatusError(null);
    setPollError(null);
    try {
      const out = await authed<{ runId: string }>("/api/v1/admin/shards/migrate", undefined, { method: "POST", body: JSON.stringify({ newShard: NEW_SHARD }) });
      setRunId(out.runId);
      setRunProgress({ state: "STARTING", step: "prepare" });
    } catch (err) {
      setActionError(toUserMessage(err, "We couldn't start the migration"));
    }
  }

  function retryPoll() {
    setPollError(null);
    setPollTick((tick) => tick + 1);
  }

  const empVersions = (info?.versions ?? []).filter((v) => v.domain === "employee");
  const activeMembers = empVersions.find((v) => v.active)?.members.split(",").map((member) => member.trim()).filter(Boolean) ?? [];
  const canAdd = !activeMembers.includes(NEW_SHARD);
  const progress = runProgress ? describeRun(runProgress.state, runProgress.step) : null;

  return (
    <AppShell title="Database shards">
      {state === "loading" && <SkeletonRows n={4} />}
      {state === "error" && error && (
        <ErrorState
          title={error.title}
          body={error.body}
          actionLabel={error.actionLabel}
          actionHref={error.action === "signin" ? "/login" : error.action === "back" ? "/dashboard" : undefined}
          onAction={error.action === "signin" || error.action === "back" ? undefined : () => void load()}
        />
      )}
      {state === "ready" && info && (
        <div className="grid max-w-4xl gap-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-hof">Active databases</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeMembers.map((member) => (
                <span key={member} className="rounded-full bg-primary-soft px-3 py-1.5 text-[13px] font-semibold text-primary-ink">
                  {shardLabel(member)} · active
                </span>
              ))}
              {canAdd && (
                <span className="rounded-full bg-pearl px-3 py-1.5 text-[13px] font-semibold text-foggy">
                  {shardLabel(NEW_SHARD)} · standby
                </span>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {canAdd && (
                <>
                  <Button onClick={doPreview}>Preview adding {shardLabel(NEW_SHARD)}</Button>
                  <button onClick={doMigrate} className="inline-flex h-12 items-center rounded-full border border-hof px-6 text-[15px] font-semibold text-hof outline-none transition duration-200 hover:bg-pearl focus-visible:ring-2 focus-visible:ring-hof focus-visible:ring-offset-2 active:scale-[0.98]">
                    Add {shardLabel(NEW_SHARD)}
                  </button>
                </>
              )}
            </div>
            {preview && (
              <p className="mt-3 text-sm tabular-nums text-hof">
                This will add {shardLabel(NEW_SHARD)} to the active databases and move about {preview.estimatedRows.toLocaleString("en-IN")} records. Writes pause while data moves.
              </p>
            )}
            {progress && (
              <div className="mt-3">
                <p className="text-sm font-semibold text-hof">{progress.title}</p>
                <p className="text-sm text-foggy">{progress.detail}</p>
              </div>
            )}
            {pollError && (
              <Alert
                tone="danger"
                title={pollError.title}
                className="mt-3"
                action={{ label: "Try again", onClick: retryPoll }}
              >
                {pollError.body}
              </Alert>
            )}
            {actionError && (
              <Alert tone="danger" title={actionError.title} className="mt-3">
                {actionError.body}
              </Alert>
            )}
            {statusError && (
              <Alert
                tone="danger"
                title={statusError.title}
                className="mt-3"
                action={{ label: "Try again", onClick: () => void refresh() }}
              >
                {statusError.body}
              </Alert>
            )}
          </Card>

          <Card className="divide-y divide-line-soft">
            <h2 className="px-5 pt-5 text-lg font-semibold text-hof">Shard status</h2>
            {Object.entries(info.gates).map(([id, gate]) => {
              const status = gateStatus(gate.state);
              return (
                <div key={id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <p className="min-w-0 flex-1 text-[15px] font-semibold text-hof">{shardLabel(id)}</p>
                  <p className="text-sm tabular-nums text-foggy">{peopleLabel(gate.employees)}</p>
                  <StatusPill status={status.label} tone={status.tone} />
                </div>
              );
            })}
          </Card>

          <Card className="divide-y divide-line-soft">
            <h2 className="px-5 pt-5 text-lg font-semibold text-hof">Live processes</h2>
            {info.registry.length === 0 && <p className="px-5 py-4 text-sm text-foggy">None reporting.</p>}
            {info.registry.map((process) => {
              const config = configStatus(process.gate_state);
              return (
                <div key={process.process_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-hof">{processLabel(process.kind)}</p>
                    <p className="mt-0.5 text-[13px] tabular-nums text-foggy">Last heartbeat {fmtDateTime(process.heartbeat_at)}</p>
                  </div>
                  <StatusPill status={config.label} tone={config.tone} />
                </div>
              );
            })}
          </Card>

          <Card className="divide-y divide-line-soft">
            <h2 className="px-5 pt-5 text-lg font-semibold text-hof">Recent migrations</h2>
            {info.runs.length === 0 && <p className="px-5 py-4 text-sm text-foggy">None yet.</p>}
            {info.runs.map((run) => {
              const status = migrationStatus(run.state);
              return (
                <div key={run.run_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-hof">Migration · {fmtDateTime(run.created_at)}</p>
                    <p className="mt-0.5 text-[13px] text-foggy">{migrationDestinationCopy(run.state, shardLabel(run.new_shard))}</p>
                  </div>
                  <StatusPill status={status.label} tone={status.tone} />
                </div>
              );
            })}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
