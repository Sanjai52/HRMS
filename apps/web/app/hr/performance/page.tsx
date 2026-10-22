"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { Alert, ErrorState } from "../../../components/feedback";
import { Card, SkeletonRows } from "../../../components/ui";
import { toUserMessage, type UserError } from "../../../lib/errors";
import { authed, authedMeta } from "../../../lib/hr";

interface Summary {
  reviews: number;
  released: number;
  completion: number;
  distribution: Record<string, number>;
}

interface Cycle {
  cycle_id: string;
  name: string;
  status: string;
}

export default function HrPerformancePage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<UserError | null>(null);
  const [partial, setPartial] = useState(false);

  async function loadSummary(cid: string) {
    setState("loading");
    setError(null);
    try {
      const body = await authedMeta<Summary>(`/api/v1/performance/summary${cid ? `?cycleId=${cid}` : ""}`);
      setSummary(body.data);
      setPartial(body.meta?.partial === true);
      setState("ready");
    } catch (err) {
      setPartial(false);
      setError(toUserMessage(err, "We couldn't load performance"));
      setState("error");
    }
  }

  async function loadCycles() {
    setState("loading");
    setError(null);
    try {
      const c = await authed<Cycle[]>("/api/v1/performance/cycles");
      setCycles(c);
      const active = c.find((x) => x.status === "ACTIVE");
      if (active) {
        setCycleId(active.cycle_id);
        await loadSummary(active.cycle_id);
      } else {
        setSummary(null);
        setPartial(false);
        setState("ready");
      }
    } catch (err) {
      setPartial(false);
      setError(toUserMessage(err, "We couldn't load performance"));
      setState("error");
    }
  }

  useEffect(() => {
    loadCycles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retry() {
    if (cycles.length === 0) {
      void loadCycles();
      return;
    }
    void loadSummary(cycleId);
  }

  return (
    <AppShell title="Performance overview">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium text-hof">
          Cycle{" "}
          <select aria-label="Review cycle" value={cycleId} onChange={(e) => { setCycleId(e.target.value); void loadSummary(e.target.value); }} className="h-10 rounded-input border border-line bg-white px-3 text-sm outline-none transition duration-200 focus:border-hof focus-visible:ring-2 focus-visible:ring-hof/40">
            <option value="">All cycles</option>
            {cycles.map((c) => (
              <option key={c.cycle_id} value={c.cycle_id}>{c.name}</option>
            ))}
          </select>
        </label>
        <Link href="/hr/performance/cycles" className="ml-auto inline-flex h-10 items-center rounded-full bg-hof px-5 text-sm font-semibold text-white outline-none transition duration-200 hover:bg-black focus-visible:ring-2 focus-visible:ring-hof focus-visible:ring-offset-2 active:scale-[0.98]">
          Manage cycles
        </Link>
      </div>
      {state === "ready" && partial && (
        <Alert
          tone="warning"
          className="mb-4"
          action={{ label: "Try again", onClick: retry }}
        >
          Some performance data is temporarily unavailable. These figures may be incomplete.
        </Alert>
      )}
      {state === "loading" && <SkeletonRows n={3} />}
      {state === "error" && error && (
        <ErrorState
          title={error.title}
          body={error.body}
          actionLabel={error.actionLabel}
          actionHref={error.action === "signin" ? "/login" : error.action === "back" ? "/dashboard" : undefined}
          onAction={error.action === "signin" || error.action === "back" ? undefined : retry}
        />
      )}
      {state === "ready" && !summary && !partial && (
        <Card className="max-w-3xl p-8 text-center">
          <p className="text-balance text-[15px] font-semibold text-hof">No review data yet</p>
          <p className="mt-1 text-sm text-foggy">Open a review cycle to start setting goals and writing reviews.</p>
        </Card>
      )}
      {state === "ready" && summary && (
        <div className="grid max-w-3xl gap-4 sm:grid-cols-5">
          <Card className="p-6 sm:col-span-3">
            <p className="text-sm font-medium text-foggy">{partial ? "Completion (known reviews)" : "Completion"}</p>
            <p className="mt-1 text-4xl font-semibold tabular-nums text-hof">{summary.completion}%</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-pearl" aria-hidden="true">
              <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${summary.completion}%` }} />
            </div>
            <p className="mt-2 text-sm tabular-nums text-foggy">
              {partial
                ? `${summary.released} of ${summary.reviews} known reviews released`
                : `${summary.released} of ${summary.reviews} reviews released`}
            </p>
          </Card>
          <div className="grid gap-4 sm:col-span-2">
            <Card className="p-5">
              <p className="text-sm font-medium text-foggy">{partial ? "Reviews written (known)" : "Reviews written"}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-hof">{summary.reviews}</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm font-medium text-foggy">{partial ? "Rating mix (known)" : "Rating mix"}</p>
              <p className="mt-1 text-sm font-medium tabular-nums text-hof">
                {[5, 4, 3, 2, 1].map((n) => `${n}★ ${summary.distribution[String(n)] ?? 0}`).join(" · ")}
              </p>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}
