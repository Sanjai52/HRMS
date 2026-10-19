"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { Button, Card, SkeletonRows, StatusPill } from "../../../components/ui";
import { authed } from "../../../lib/hr";

interface Health {
  versions: Array<{ version: number; domain: string; members: string; active: boolean }>;
  gates: Record<string, { state: string; employees?: string; pending_outbox?: string }>;
  registry: Array<{ process_id: string; kind: string }>;
}

export default function SystemHealthPage() {
  const [info, setInfo] = useState<Health | null>(null);
  const [metrics, setMetrics] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load() {
    setError("");
    authed<Health>("/api/v1/admin/shards")
      .then((h) => setInfo(h))
      .catch((err) => setError((err as Error).message));
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
    fetch(`${base}/metrics`)
      .then(async (r) => {
        const text = await r.text();
        const lines = text.split("\n").filter((l) => l.startsWith("hrms_http_requests_total") && !l.startsWith("#")).slice(0, 12);
        setMetrics(lines.join("\n"));
      })
      .catch(() => undefined);
  }

  const allOpen = info ? Object.values(info.gates).every((g) => g.state === "OPEN") : false;

  return (
    <AppShell title="System health">
      {!info && !error && <SkeletonRows n={3} />}
      {error && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Restricted area</p>
          <p className="mt-1 text-sm text-foggy">{error}</p>
          <Button variant="quiet" onClick={load} className="mt-4 h-10 px-5 text-sm">
            Try again
          </Button>
        </Card>
      )}
      {info && (
        <div className="grid max-w-3xl gap-6">
          <Card className="flex flex-wrap items-center gap-4 p-6">
            <StatusPill status={allOpen ? "ACTIVE" : "GATED"} />
            <p className="text-[15px] text-hof">{allOpen ? "All databases accept writes." : "Writes are paused on at least one database."}</p>
          </Card>
          <Card className="divide-y divide-line-soft">
            <h2 className="px-5 pt-5 text-lg font-semibold text-hof">Databases</h2>
            {Object.entries(info.gates).map(([id, g]) => (
              <div key={id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <p className="min-w-0 flex-1 text-[15px] font-semibold text-hof">{id}</p>
                <p className="text-sm tabular-nums text-foggy">{g.employees ?? "?"} people · {g.pending_outbox ?? "?"} queued events</p>
                <StatusPill status={g.state} />
              </div>
            ))}
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-hof">Request traffic</h2>
            <pre className="mt-3 overflow-x-auto rounded-input bg-hof p-4 font-mono text-xs tabular-nums leading-relaxed text-white">{metrics || "Loading…"}</pre>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href="http://localhost:9090" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-full border border-line px-5 text-sm font-semibold text-hof outline-none transition duration-200 hover:bg-pearl focus-visible:ring-2 focus-visible:ring-hof focus-visible:ring-offset-2">
                Prometheus
              </a>
              <a href="http://localhost:3001" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-full border border-line px-5 text-sm font-semibold text-hof outline-none transition duration-200 hover:bg-pearl focus-visible:ring-2 focus-visible:ring-hof focus-visible:ring-offset-2">
                Grafana
              </a>
              <a href="http://localhost:8025" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-full border border-line px-5 text-sm font-semibold text-hof outline-none transition duration-200 hover:bg-pearl focus-visible:ring-2 focus-visible:ring-hof focus-visible:ring-offset-2">
                Mailpit
              </a>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
