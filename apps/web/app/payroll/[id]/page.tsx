"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { Card, SkeletonRows } from "../../../components/ui";
import { authed } from "../../../lib/hr";

interface Slip {
  record_id: string;
  period: string;
  name: string;
  email: string;
  gross_paise: number;
  lop_paise: number;
  pf_paise: number;
  tax_paise: number;
  other_paise: number;
  net_paise: number;
  scheduled_days: number;
  paid_days: number;
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [slip, setSlip] = useState<Slip | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    authed<Slip>(`/api/v1/payroll/payslips/${id}`)
      .then(setSlip)
      .catch((err) => setError((err as Error).message));
  }, [id]);

  return (
    <AppShell title={slip ? `Payslip · ${slip.period}` : "Payslip"}>
      {!slip && !error && <SkeletonRows n={4} />}
      {error && (
        <Card className="max-w-xl p-8 text-center">
          <p className="font-semibold text-hof">Could not open this payslip</p>
          <p className="mt-1 text-sm text-foggy">{error}</p>
        </Card>
      )}
      {slip && (
        <Card className="max-w-xl p-6">
          <p className="text-lg font-extrabold text-hof">{slip.name}</p>
          <p className="text-sm text-foggy">{slip.email} · {slip.period} · {slip.paid_days}/{slip.scheduled_days} paid days</p>
          <dl className="mt-5 divide-y divide-line-soft text-[15px]">
            {[
              ["Gross earnings", slip.gross_paise, false],
              ["Loss of pay", -slip.lop_paise, false],
              ["Provident fund", -slip.pf_paise, false],
              ["Tax (demonstration)", -slip.tax_paise, false],
              ["Other deductions", -slip.other_paise, false],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between py-2.5">
                <dt className="text-foggy">{label}</dt>
                <dd className="font-semibold text-hof">{rupees(value as number)}</dd>
              </div>
            ))}
            <div className="flex justify-between py-3">
              <dt className="font-bold text-hof">Net pay</dt>
              <dd className="text-lg font-extrabold text-hof">{rupees(slip.net_paise)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[13px] text-foggy">Demonstration calculation, not tax filing or bank disbursement.</p>
          <Link href="/payroll" className="mt-4 inline-block text-sm font-semibold text-hof underline underline-offset-4">
            Back to payroll
          </Link>
        </Card>
      )}
    </AppShell>
  );
}
