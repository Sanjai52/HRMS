"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { Card, SkeletonRows, StatusPill } from "../../../components/ui";
import { DecisionButtons } from "../../../components/leave-decision";
import { authed, fmtDay } from "../../../lib/hr";

interface Req {
  request_id: string;
  employee_id: string;
  requester_name?: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  workdays: number;
  status: string;
  version: number;
}

export default function HrLeavePage() {
  const [rows, setRows] = useState<Req[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [filter, setFilter] = useState("PENDING_HR");
  const [policies, setPolicies] = useState<Array<{ leave_type: string; annual_allowance: number }>>([]);

  async function load() {
    try {
      const [r, p] = await Promise.all([
        authed<Req[]>(`/api/v1/leave/requests${filter ? `?status=${filter}` : ""}`),
        authed<{ policies: Array<{ leave_type: string; annual_allowance: number }> }>("/api/v1/leave/policies"),
      ]);
      setRows(r);
      setPolicies(p.policies);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <AppShell title="Leave administration">
      <div className="grid max-w-3xl gap-6">
        <div className="flex flex-wrap gap-2">
          {policies.map((p) => (
            <span key={p.leave_type} className="rounded-full bg-pearl px-3 py-1.5 text-[13px] font-medium text-hof">
              {p.leave_type.toLowerCase()} · {p.annual_allowance} days
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          {["PENDING_HR", "PENDING_MANAGER", "APPROVED", "REJECTED", ""].map((s) => (
            <button
              key={s || "all"}
              onClick={() => setFilter(s)}
              className={`h-9 rounded-full px-4 text-[13px] font-semibold transition ${filter === s ? "bg-hof text-white" : "bg-pearl text-foggy hover:text-hof"}`}
            >
              {s ? s.replace("PENDING_", "").toLowerCase() : "All"}
            </button>
          ))}
        </div>
        {state === "loading" && <SkeletonRows n={4} />}
        {state === "error" && (
          <Card className="p-8 text-center">
            <p className="font-semibold text-hof">Could not load requests</p>
          </Card>
        )}
        {state === "ready" && (
          <Card className="divide-y divide-line-soft">
            {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">Nothing here.</p>}
            {rows.map((r) => (
              <div key={r.request_id} className="grid gap-3 px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-hof">{r.requester_name ?? r.employee_id.slice(0, 8)}</p>
                    <p className="text-sm capitalize text-foggy">{r.leave_type.toLowerCase()} · {r.workdays}d · {fmtDay(r.start_date)} → {fmtDay(r.end_date)}</p>
                  </div>
                  <StatusPill status={r.status} />
                </div>
                <DecisionButtons target={r} onDone={load} allowOverride />
              </div>
            ))}
          </Card>
        )}
      </div>
    </AppShell>
  );
}
