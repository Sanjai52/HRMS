"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { Card, SkeletonRows, StatusPill } from "../../../components/ui";
import { DecisionButtons } from "../../../components/leave-decision";
import { authed, fmtDay } from "../../../lib/hr";

interface Req {
  request_id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  workdays: number;
  status: string;
  version: number;
}

function Queue({ title, fetchPath, allowOverride }: { title: string; fetchPath: string; allowOverride?: boolean }) {
  const [rows, setRows] = useState<Req[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [filter, setFilter] = useState("");

  async function load() {
    try {
      const data = await authed<Req[]>(fetchPath + (filter ? `?status=${filter}` : ""));
      setRows(data);
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
    <div>
      <div className="mb-4 flex gap-2">
        {["", "PENDING_MANAGER", "PENDING_HR", "APPROVED", "REJECTED"].map((s) => (
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
          <p className="font-semibold text-hof">Could not load {title.toLowerCase()}</p>
        </Card>
      )}
      {state === "ready" && (
        <Card className="divide-y divide-line-soft">
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">Nothing here.</p>}
          {rows.map((r) => (
            <div key={r.request_id} className="grid gap-3 px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold capitalize text-hof">{r.leave_type.toLowerCase()} · {r.workdays}d</p>
                  <p className="text-sm text-foggy">{fmtDay(r.start_date)} → {fmtDay(r.end_date)}</p>
                </div>
                <StatusPill status={r.status} />
              </div>
              <DecisionButtons target={r} onDone={load} allowOverride={allowOverride} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

export default function ManagerLeavePage() {
  return (
    <AppShell title="Leave approvals">
      <div className="max-w-3xl">
        <Queue title="approvals" fetchPath="/api/v1/leave/requests" />
      </div>
    </AppShell>
  );
}
