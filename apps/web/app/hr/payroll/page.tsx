"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { ErrorState } from "../../../components/feedback";
import { Card, SkeletonRows, StatusPill } from "../../../components/ui";
import { toUserMessage, type UserError } from "../../../lib/errors";
import { periodLabel } from "../../../lib/format";
import { authed } from "../../../lib/hr";

interface Batch {
  batch_id: string;
  period: string;
  status: string;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  created_at: string;
}

export default function PayrollPage() {
  const [rows, setRows] = useState<Batch[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<UserError | null>(null);

  async function load() {
    setState("loading");
    setError(null);
    try {
      setRows(await authed<Batch[]>("/api/v1/payroll/batches"));
      setState("ready");
    } catch (err) {
      setError(toUserMessage(err, "We couldn't load payroll"));
      setState("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Payroll">
      <div className="mb-5 flex justify-end">
        <Link href="/hr/payroll/run" className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-white transition hover:bg-primary-hover active:scale-[0.98]">
          Run payroll
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
        <Card className="divide-y divide-line-soft">
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No payroll runs yet.</p>}
          {rows.map((b) => (
            <Link key={b.batch_id} href={`/hr/payroll/batches/${b.batch_id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-pearl/60">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-hof">{periodLabel(b.period)}</p>
                <p className="text-sm text-foggy">{b.done} done · {b.failed} failed · {b.skipped} skipped of {b.total}</p>
              </div>
              <StatusPill status={b.status} />
            </Link>
          ))}
        </Card>
      )}
    </AppShell>
  );
}
