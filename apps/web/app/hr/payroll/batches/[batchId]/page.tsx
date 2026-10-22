"use client";
import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../../../components/app-shell";
import { Alert, ErrorState } from "../../../../../components/feedback";
import { Card, SkeletonRows, StatusPill } from "../../../../../components/ui";
import { toUserMessage, type UserError } from "../../../../../lib/errors";
import { fmtMoney, periodLabel } from "../../../../../lib/format";
import { authedMeta } from "../../../../../lib/hr";

interface Rec {
  record_id: string;
  name: string;
  net_paise: number;
  gross_paise: number;
}

interface Batch {
  batch_id: string;
  period: string;
  status: string;
  total: number;
  done: number;
  failed: number;
  skipped: number;
}

const TERMINAL_STATUSES = ["COMPLETED", "PARTIAL_FAILED", "FAILED"];

export default function BatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = use(params);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [records, setRecords] = useState<Rec[]>([]);
  const [loadError, setLoadError] = useState<UserError | null>(null);
  const [pollError, setPollError] = useState<UserError | null>(null);
  const [partial, setPartial] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const batchRef = useRef<Batch | null>(null);

  useEffect(() => {
    batchRef.current = null;
    setBatch(null);
    setRecords([]);
    setLoadError(null);
    setPollError(null);
    setPartial(false);
  }, [batchId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let polling = true;

    async function tick() {
      try {
        const body = await authedMeta<{ batch: Batch; records: Rec[] }>(`/api/v1/payroll/batches/${batchId}`);
        if (cancelled) return;
        batchRef.current = body.data.batch;
        setBatch(body.data.batch);
        setRecords(body.data.records);
        setPartial(body.meta?.partial === true);
        setLoadError(null);
        setPollError(null);
        if (TERMINAL_STATUSES.includes(body.data.batch.status)) {
          polling = false;
          if (timer) clearInterval(timer);
        }
      } catch (err) {
        if (cancelled) return;
        const message = toUserMessage(err, "We couldn't load this payroll run");
        polling = false;
        if (timer) clearInterval(timer);
        if (batchRef.current) {
          setPollError(message);
        } else {
          setLoadError(message);
        }
      }
    }

    void tick();
    timer = setInterval(() => {
      if (polling) void tick();
    }, 2000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [batchId, attempt]);

  function retry() {
    setLoadError(null);
    setPollError(null);
    setAttempt((n) => n + 1);
  }

  const pct = batch && batch.total > 0 ? Math.round(((batch.done + batch.failed + batch.skipped) / batch.total) * 100) : 0;

  return (
    <AppShell title={batch ? `Payroll ${periodLabel(batch.period)}` : "Payroll run"}>
      {!batch && !loadError && <SkeletonRows n={3} />}
      {loadError && !batch && (
        <ErrorState
          title={loadError.title}
          body={loadError.body}
          actionLabel={loadError.action === "back" ? "Back to payroll" : loadError.actionLabel}
          actionHref={loadError.action === "signin" ? "/login" : loadError.action === "back" ? "/hr/payroll" : undefined}
          onAction={loadError.action === "signin" || loadError.action === "back" ? undefined : retry}
          secondaryLabel={loadError.action === "back" ? undefined : "Back to payroll"}
          secondaryHref={loadError.action === "back" ? undefined : "/hr/payroll"}
        />
      )}
      {pollError && batch && (
        <Alert
          tone="warning"
          title="This payroll run may be out of date"
          className="mb-4"
          action={{ label: "Try again", onClick: retry }}
        >
          We couldn&apos;t refresh the progress. The figures below are from the last successful update.
        </Alert>
      )}
      {partial && batch && (
        <Alert
          tone="warning"
          title="This payroll run may be incomplete"
          className="mb-4"
          action={{ label: "Try again", onClick: retry }}
        >
          Some payslips couldn&apos;t be loaded. Retry to refresh this run.
        </Alert>
      )}
      {batch && (
        <div className="grid max-w-3xl gap-6">
          <Card className="p-6">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill status={batch.status} />
              <p className="text-sm text-foggy">{batch.done} done · {batch.failed} failed · {batch.skipped} skipped of {batch.total}</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-pearl">
              <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          </Card>
          <Card className="divide-y divide-line-soft">
            {records.length === 0 && !partial && (
              <p className="px-5 py-6 text-sm text-foggy">
                {TERMINAL_STATUSES.includes(batch.status) ? "No payslips in this run." : "No payslips yet — processing."}
              </p>
            )}
            {records.map((r) => (
              <div key={r.record_id} className="flex items-center gap-3 px-5 py-3.5">
                <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-hof">{r.name?.trim() || "Employee"}</p>
                <p className="text-sm text-foggy">{fmtMoney(r.gross_paise)}</p>
                <p className="w-28 text-right text-[15px] font-bold text-hof">{fmtMoney(r.net_paise)}</p>
              </div>
            ))}
          </Card>
          <Link href="/hr/payroll" className="text-sm font-semibold text-hof underline underline-offset-4">
            Back to payroll
          </Link>
        </div>
      )}
    </AppShell>
  );
}
