"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../components/app-shell";
import { Card, SkeletonRows } from "../../components/ui";
import { authed } from "../../lib/hr";

interface Slip {
  record_id: string;
  period: string;
  net_paise: number;
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function MyPayrollPage() {
  const [rows, setRows] = useState<Slip[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    authed<Slip[]>("/api/v1/payroll/me")
      .then((data) => {
        setRows(data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  return (
    <AppShell title="My payroll">
      {state === "loading" && <SkeletonRows n={3} />}
      {state === "error" && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Sign in to see your payslips</p>
          <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-hof underline underline-offset-4">
            Go to login
          </Link>
        </Card>
      )}
      {state === "ready" && (
        <Card className="max-w-3xl divide-y divide-line-soft">
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No payslips yet.</p>}
          {rows.map((r) => (
            <Link key={r.record_id} href={`/payroll/${r.record_id}`} className="flex items-center gap-3 px-5 py-4 transition hover:bg-pearl/60">
              <p className="min-w-0 flex-1 text-[15px] font-semibold text-hof">Payslip · {r.period}</p>
              <p className="text-[15px] font-bold text-hof">{rupees(r.net_paise)}</p>
            </Link>
          ))}
        </Card>
      )}
    </AppShell>
  );
}
