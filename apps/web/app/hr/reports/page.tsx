"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { Card, SkeletonRows, StatusPill } from "../../../components/ui";
import { authedMeta } from "../../../lib/hr";

interface Overview {
  month: string;
  headcount: Array<{ department: string; n: string }>;
  attendance: { present: number; late: number; records: number };
  leave: Record<string, number>;
  payroll: Array<{ period: string; status: string; done: number; failed: number; skipped: number }>;
  funnel: Record<string, number>;
}

const FLOW = ["APPLIED", "SCREENING", "SHORTLISTED", "ASSESSMENT", "INTERVIEW", "SELECTED"];

export default function ReportsPage() {
  const [d, setD] = useState<Overview | null>(null);
  const [partial, setPartial] = useState<string[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    authedMeta<Overview>("/api/v1/reports/overview")
      .then((body) => {
        setD(body.data);
        setPartial(body.meta?.partial ? body.meta.unavailable ?? [] : []);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  return (
    <AppShell title="Reports">
      {state === "loading" && <SkeletonRows n={5} />}
      {state === "error" && (
        <Card className="p-8 text-center">
          <p className="text-balance text-[15px] font-semibold text-hof">Restricted area</p>
          <p className="mt-1 text-sm text-foggy">HR access required. Sign in with an HR account to view reports.</p>
        </Card>
      )}
      {state === "ready" && d && (
        <div className="grid max-w-4xl gap-6">
          {partial.length > 0 && (
            <p role="status" className="rounded-card border border-arches/40 bg-arches/10 px-4 py-2 text-sm font-medium text-hof">
              Partial results — unavailable: {partial.join(", ")}. Healthy records are complete.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <p className="text-sm font-medium text-foggy">People</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-hof">{d.headcount.reduce((a, x) => a + Number(x.n), 0)}</p>
              <p className="mt-1 text-[13px] tabular-nums text-foggy">{d.headcount.length} departments</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm font-medium text-foggy">Leave requests</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-hof">{Object.values(d.leave).reduce((a, x) => a + x, 0)}</p>
              <p className="mt-1 text-[13px] tabular-nums text-foggy">{d.leave.PENDING_HR ?? 0} with HR · {d.leave.PENDING_MANAGER ?? 0} with managers</p>
            </Card>
          </div>
          <Card className="p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-foggy">Attendance records ({d.month})</p>
              <p className="text-2xl font-semibold tabular-nums text-hof">{d.attendance.records}</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-pearl" aria-hidden="true">
              <div className="h-full rounded-full bg-rausch transition-[width] duration-200" style={{ width: `${d.attendance.records > 0 ? Math.round((d.attendance.present / d.attendance.records) * 100) : 0}%` }} />
            </div>
            <p className="mt-2 text-[13px] tabular-nums text-foggy">{d.attendance.present} present · {d.attendance.late} late</p>
          </Card>
          <Card className="p-6">
            <h2 className="text-balance text-lg font-semibold text-hof">Headcount by department</h2>
            {d.headcount.filter((x) => x.department).length === 0 && <p className="mt-2 text-sm text-foggy">No active employees yet.</p>}
            <ul className="mt-3 grid gap-2">
              {d.headcount.filter((x) => x.department).map((x) => (
                <li key={x.department} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-sm font-medium text-hof">{x.department}</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-pearl">
                    <span className="block h-full rounded-full bg-rausch transition-[width] duration-200" style={{ width: `${Math.max(4, (Number(x.n) / Math.max(1, Number(d.headcount[0]?.n ?? 1))) * 100)}%` }} />
                  </span>
                  <span className="w-8 text-right text-sm font-semibold tabular-nums text-hof">{x.n}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-6">
            <h2 className="text-balance text-lg font-semibold text-hof">Hiring pipeline</h2>
            <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Pipeline">
              {FLOW.map((s) => (
                <span key={s} className="grid min-w-16 flex-1 place-items-center rounded-input bg-pearl px-2 py-2 text-center">
                  <span className="text-lg font-semibold tabular-nums text-hof">{d.funnel[s] ?? 0}</span>
                  <span className="text-[11px] font-medium capitalize text-foggy">{s.toLowerCase()}</span>
                </span>
              ))}
            </div>
          </Card>
          <Card className="divide-y divide-line-soft">
            <h2 className="text-balance px-5 pt-5 text-lg font-semibold text-hof">Recent payroll runs</h2>
            {d.payroll.length === 0 && <p className="px-5 py-4 text-sm text-foggy">No runs yet.</p>}
            {d.payroll.map((p, i) => (
              <div key={`${p.period}-${i}`} className="flex items-center gap-3 px-5 py-3.5">
                <p className="min-w-0 flex-1 text-[15px] font-medium text-hof">{p.period}</p>
                <p className="text-sm tabular-nums text-foggy">{p.done} done · {p.failed} failed</p>
                <StatusPill status={p.status} />
              </div>
            ))}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
