"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { Alert, ErrorState } from "../../../components/feedback";
import { Card, SkeletonRows, StatusPill } from "../../../components/ui";
import { DecisionButtons } from "../../../components/leave-decision";
import { toUserMessage, type UserError } from "../../../lib/errors";
import { fmtDay } from "../../../lib/format";
import { authed, authedMeta } from "../../../lib/hr";

interface Req {
  request_id: string;
  employee_id: string;
  requester_name?: string | null;
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
  const [error, setError] = useState<UserError | null>(null);
  const [partial, setPartial] = useState(false);
  const [filter, setFilter] = useState("PENDING_HR");
  const [policies, setPolicies] = useState<Array<{ leave_type: string; annual_allowance: number }>>([]);

  async function load() {
    setState("loading");
    setError(null);
    try {
      const [r, p] = await Promise.all([
        authedMeta<Req[]>(`/api/v1/leave/requests${filter ? `?status=${filter}` : ""}`),
        authed<{ policies: Array<{ leave_type: string; annual_allowance: number }> }>("/api/v1/leave/policies"),
      ]);
      setRows(r.data);
      setPartial(r.meta?.partial === true);
      setPolicies(p.policies);
      setState("ready");
    } catch (err) {
      setPartial(false);
      setError(toUserMessage(err, "We couldn't load leave requests"));
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
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
              className={`h-9 rounded-full px-4 text-[13px] font-semibold transition ${filter === s ? "bg-hof text-white" : "bg-pearl text-foggy hover:text-hof"}`}
            >
              {s ? s.replace("PENDING_", "").toLowerCase() : "All"}
            </button>
          ))}
        </div>
        {state === "ready" && partial && (
          <Alert
            tone="warning"
            className="mb-1"
            action={{ label: "Try again", onClick: () => void load() }}
          >
            Some requests are temporarily unavailable. This list may be incomplete.
          </Alert>
        )}
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
        {state === "ready" && (
          <Card className="divide-y divide-line-soft">
            {rows.length === 0 && !partial && <p className="px-5 py-6 text-sm text-foggy">No leave requests in this view.</p>}
            {rows.map((r) => (
              <div key={r.request_id} className="grid gap-3 px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-hof">{r.requester_name?.trim() || "Employee"}</p>
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
