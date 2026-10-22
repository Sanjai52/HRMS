"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { ErrorState } from "../../../components/feedback";
import { Card, SkeletonRows, StatusPill, type StatusTone } from "../../../components/ui";
import { toUserMessage, type UserError } from "../../../lib/errors";
import { authed } from "../../../lib/hr";
import { safeHttpUrl } from "../../../lib/format";

interface GateHealth {
  state: string;
  employees?: string;
  pending_outbox?: string;
}

interface Health {
  gates: Record<string, GateHealth>;
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

function countsLabel(gate: GateHealth): string {
  const people = Number(gate.employees);
  const events = Number(gate.pending_outbox);
  const parts: string[] = [];
  if (Number.isFinite(people)) {
    parts.push(`${people.toLocaleString("en-IN")} ${people === 1 ? "person" : "people"}`);
  }
  if (Number.isFinite(events)) {
    parts.push(`${events.toLocaleString("en-IN")} ${events === 1 ? "queued event" : "queued events"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Counts unavailable";
}

export default function SystemHealthPage() {
  const [info, setInfo] = useState<Health | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<UserError | null>(null);

  async function load() {
    setState("loading");
    setError(null);
    try {
      setInfo(await authed<Health>("/api/v1/admin/shards"));
      setState("ready");
    } catch (err) {
      setError(toUserMessage(err, "We couldn't load system health"));
      setState("error");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gates = info ? Object.entries(info.gates) : [];
  const allOpen = gates.length > 0 && gates.every(([, gate]) => (gate.state ?? "").toUpperCase() === "OPEN");
  const hasUnreachable = gates.some(([, gate]) => (gate.state ?? "").toUpperCase() === "UNREACHABLE");
  const hasGated = gates.some(([, gate]) => (gate.state ?? "").toUpperCase() === "GATED");
  const summary: { label: string; tone: StatusTone; copy: string } | null =
    gates.length === 0
      ? null
      : allOpen
        ? { label: "Accepting writes", tone: "success", copy: "All databases accept writes." }
        : hasUnreachable
          ? { label: "Some databases unreachable", tone: "danger", copy: "Some databases are unreachable." }
          : hasGated
            ? { label: "Writes paused", tone: "warning", copy: "Writes are paused on at least one database." }
            : { label: "Status unavailable", tone: "neutral", copy: "Database status is unavailable." };
  const monitoringUrl = safeHttpUrl(process.env.NEXT_PUBLIC_MONITORING_URL);

  return (
    <AppShell title="System health">
      {state === "loading" && <SkeletonRows n={3} />}
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
        <div className="grid max-w-3xl gap-6">
          <Card className="flex flex-wrap items-center gap-4 p-6">
            {summary && <StatusPill status={summary.label} tone={summary.tone} />}
            <p className="text-[15px] text-hof">
              {summary ? summary.copy : "No databases are reporting yet."}
            </p>
          </Card>
          <Card className="divide-y divide-line-soft">
            <h2 className="px-5 pt-5 text-lg font-semibold text-hof">Databases</h2>
            {gates.map(([id, gate]) => {
              const status = gateStatus(gate.state);
              return (
                <div key={id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <p className="min-w-0 flex-1 text-[15px] font-semibold text-hof">{shardLabel(id)}</p>
                  <p className="text-sm tabular-nums text-foggy">{countsLabel(gate)}</p>
                  <StatusPill status={status.label} tone={status.tone} />
                </div>
              );
            })}
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-hof">Request traffic</h2>
            <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-foggy">
              Live metrics are available to administrators in the monitoring dashboard.
            </p>
            {monitoringUrl && (
              <a
                href={monitoringUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex h-10 items-center rounded-full border border-line px-5 text-sm font-semibold text-hof outline-none transition duration-200 hover:bg-pearl focus-visible:ring-2 focus-visible:ring-hof focus-visible:ring-offset-2"
              >
                Open monitoring
              </a>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
