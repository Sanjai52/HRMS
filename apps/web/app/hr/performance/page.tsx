"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { Button, Card, SkeletonRows } from "../../../components/ui";
import { authed } from "../../../lib/hr";

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

  async function load(cid: string) {
    try {
      setSummary(await authed<Summary>(`/api/v1/performance/summary${cid ? `?cycleId=${cid}` : ""}`));
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    authed<Cycle[]>("/api/v1/performance/cycles").then((c) => {
      setCycles(c);
      const active = c.find((x) => x.status === "ACTIVE");
      if (active) {
        setCycleId(active.cycle_id);
        load(active.cycle_id);
      } else {
        setState("ready");
      }
    }).catch(() => setState("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Performance overview">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium text-hof">
          Cycle{" "}
          <select aria-label="Review cycle" value={cycleId} onChange={(e) => { setCycleId(e.target.value); setState("loading"); load(e.target.value); }} className="h-10 rounded-input border border-line bg-white px-3 text-sm outline-none transition duration-200 focus:border-hof focus-visible:ring-2 focus-visible:ring-hof/40">
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
      {state === "loading" && <SkeletonRows n={3} />}
      {state === "error" && (
        <Card className="p-8 text-center">
          <p className="text-balance text-[15px] font-semibold text-hof">Could not load performance data</p>
          <p className="mt-1 text-sm text-foggy">Check your connection and try again.</p>
          <Button variant="outline" className="mt-4 h-10 px-5 text-sm" onClick={() => { setState("loading"); load(cycleId); }}>
            Try again
          </Button>
        </Card>
      )}
      {state === "ready" && !summary && (
        <Card className="max-w-3xl p-8 text-center">
          <p className="text-balance text-[15px] font-semibold text-hof">No review data yet</p>
          <p className="mt-1 text-sm text-foggy">Open a review cycle to start setting goals and writing reviews.</p>
        </Card>
      )}
      {state === "ready" && summary && (
        <div className="grid max-w-3xl gap-4 sm:grid-cols-5">
          <Card className="p-6 sm:col-span-3">
            <p className="text-sm font-medium text-foggy">Completion</p>
            <p className="mt-1 text-4xl font-semibold tabular-nums text-hof">{summary.completion}%</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-pearl" aria-hidden="true">
              <div className="h-full rounded-full bg-rausch transition-[width] duration-200" style={{ width: `${summary.completion}%` }} />
            </div>
            <p className="mt-2 text-sm tabular-nums text-foggy">{summary.released} of {summary.reviews} reviews released</p>
          </Card>
          <div className="grid gap-4 sm:col-span-2">
            <Card className="p-5">
              <p className="text-sm font-medium text-foggy">Reviews written</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-hof">{summary.reviews}</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm font-medium text-foggy">Rating mix</p>
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
