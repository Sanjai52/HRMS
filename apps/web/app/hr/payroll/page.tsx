"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { Card, SkeletonRows, StatusPill } from "../../../components/ui";
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

  useEffect(() => {
    authed<Batch[]>("/api/v1/payroll/batches")
      .then((data) => {
        setRows(data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  return (
    <AppShell title="Payroll">
      <div className="mb-5 flex justify-end">
        <Link href="/hr/payroll/run" className="inline-flex h-11 items-center rounded-full bg-rausch px-6 text-sm font-semibold text-white transition hover:bg-rausch-dark active:scale-[0.98]">
          Run payroll
        </Link>
      </div>
      {state === "loading" && <SkeletonRows n={4} />}
      {state === "error" && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Could not load batches</p>
        </Card>
      )}
      {state === "ready" && (
        <Card className="divide-y divide-line-soft">
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No payroll runs yet.</p>}
          {rows.map((b) => (
            <Link key={b.batch_id} href={`/hr/payroll/batches/${b.batch_id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-pearl/60">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-hof">{b.period}</p>
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
