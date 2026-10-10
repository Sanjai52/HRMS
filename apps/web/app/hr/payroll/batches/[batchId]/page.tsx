"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../../../components/app-shell";
import { Card, SkeletonRows, StatusPill } from "../../../../../components/ui";
import { authed } from "../../../../../lib/hr";

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

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function BatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = use(params);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [records, setRecords] = useState<Rec[]>([]);

  async function load() {
    try {
      const data = await authed<{ batch: Batch; records: Rec[] }>(`/api/v1/payroll/batches/${batchId}`);
      setBatch(data.batch);
      setRecords(data.records);
      return data.batch.status;
    } catch {
      return "UNKNOWN";
    }
  }

  useEffect(() => {
    let stop = false;
    load();
    const t = setInterval(async () => {
      const s = await load();
      if (stop || ["COMPLETED", "PARTIAL_FAILED", "FAILED"].includes(s)) clearInterval(t);
    }, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const pct = batch && batch.total > 0 ? Math.round(((batch.done + batch.failed + batch.skipped) / batch.total) * 100) : 0;

  return (
    <AppShell title={batch ? `Payroll ${batch.period}` : "Payroll batch"}>
      {!batch && <SkeletonRows n={3} />}
      {batch && (
        <div className="grid max-w-3xl gap-6">
          <Card className="p-6">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill status={batch.status} />
              <p className="text-sm text-foggy">{batch.done} done · {batch.failed} failed · {batch.skipped} skipped of {batch.total}</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-pearl">
              <div className="h-full rounded-full bg-babu transition-all" style={{ width: `${pct}%` }} />
            </div>
          </Card>
          <Card className="divide-y divide-line-soft">
            {records.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No records yet — processing.</p>}
            {records.map((r) => (
              <div key={r.record_id} className="flex items-center gap-3 px-5 py-3.5">
                <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-hof">{r.name}</p>
                <p className="text-sm text-foggy">{rupees(r.gross_paise)}</p>
                <p className="w-28 text-right text-[15px] font-bold text-hof">{rupees(r.net_paise)}</p>
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
