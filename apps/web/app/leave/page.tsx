"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../components/app-shell";
import { Alert, ErrorState } from "../../components/feedback";
import { Card, SkeletonRows, StatusPill } from "../../components/ui";
import { toUserMessage, type UserError } from "../../lib/errors";
import { fmtDay } from "../../lib/format";
import { authed } from "../../lib/hr";

interface Balance {
  leave_type: string;
  total_days: number;
  used_days: number;
}

interface Req {
  request_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  workdays: number;
  status: string;
}

export default function LeavePage() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [rows, setRows] = useState<Req[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<UserError | null>(null);
  const [cancelError, setCancelError] = useState<UserError | null>(null);

  async function load() {
    setState("loading");
    setError(null);
    try {
      const [b, r] = await Promise.all([
        authed<Balance[]>("/api/v1/leave/balances"),
        authed<Req[]>("/api/v1/leave/requests?mine=true"),
      ]);
      setBalances(b);
      setRows(r);
      setState("ready");
    } catch (err) {
      setError(toUserMessage(err, "We couldn't load your leave"));
      setState("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cancel(id: string) {
    setCancelError(null);
    try {
      await authed(`/api/v1/leave/requests/${id}/cancel`, undefined, { method: "POST" });
      await load();
    } catch (err) {
      setCancelError(toUserMessage(err, "We couldn't cancel this request"));
    }
  }

  return (
    <AppShell title="Leave">
      <div className="mb-5 flex justify-end">
        <Link href="/leave/apply" className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-white transition hover:bg-primary-hover active:scale-[0.98]">
          Apply for leave
        </Link>
      </div>
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
        <div className="grid max-w-3xl gap-6">
          {cancelError && (
            <Alert tone="danger" title={cancelError.title}>
              {cancelError.body}
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            {balances.map((b) => (
              <Card key={b.leave_type} className="p-5">
                <p className="text-sm font-medium capitalize text-foggy">{b.leave_type.toLowerCase()} leave</p>
                <p className="mt-1 text-2xl font-extrabold text-hof">{b.total_days - b.used_days} <span className="text-sm font-medium text-foggy">left of {b.total_days}</span></p>
              </Card>
            ))}
            {balances.length === 0 && (
              <Card className="p-5 sm:col-span-3">
                <p className="text-sm text-foggy">Balances appear after your first request.</p>
              </Card>
            )}
          </div>
          <Card className="divide-y divide-line-soft">
            <h2 className="px-5 pt-5 text-lg font-bold text-hof">My requests</h2>
            {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No requests yet.</p>}
            {rows.map((r) => (
              <div key={r.request_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold capitalize text-hof">{r.leave_type.toLowerCase()} · {r.workdays}d</p>
                  <p className="text-sm text-foggy">{fmtDay(r.start_date)} → {fmtDay(r.end_date)}</p>
                </div>
                <StatusPill status={r.status} />
                {(r.status === "PENDING_MANAGER" || r.status === "PENDING_HR") && (
                  <button onClick={() => cancel(r.request_id)} className="text-sm font-semibold text-foggy underline underline-offset-4 hover:text-hof">
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
