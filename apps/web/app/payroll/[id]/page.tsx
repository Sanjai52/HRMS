"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { ErrorState } from "../../../components/feedback";
import { Card, SkeletonRows } from "../../../components/ui";
import { toUserMessage, type UserError } from "../../../lib/errors";
import { employeeLabel, fmtMoney, periodLabel } from "../../../lib/format";
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

export default function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [slip, setSlip] = useState<Slip | null>(null);
  const [error, setError] = useState<UserError | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSlip(await authed<Slip>(`/api/v1/payroll/payslips/${id}`));
    } catch (err) {
      setSlip(null);
      setError(toUserMessage(err, "We couldn't open this payslip"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const backToPayroll = error?.action === "back";

  return (
    <AppShell title={slip ? `Payslip · ${periodLabel(slip.period)}` : "Payslip"}>
      {loading && <SkeletonRows n={4} />}
      {!loading && error && (
        <ErrorState
          title={error.title}
          body={error.body}
          actionLabel={backToPayroll ? "Back to payroll" : error.actionLabel}
          actionHref={
            error.action === "signin" ? "/login" : backToPayroll ? "/payroll" : undefined
          }
          onAction={error.action === "signin" || backToPayroll ? undefined : () => void load()}
          secondaryLabel={backToPayroll ? undefined : "Back to payroll"}
          secondaryHref={backToPayroll ? undefined : "/payroll"}
        />
      )}
      {!loading && !error && slip && (
        <Card className="max-w-xl p-6">
          <p className="text-lg font-extrabold text-hof">{employeeLabel(slip)}</p>
          <p className="text-sm text-foggy">{slip.email} · {periodLabel(slip.period)} · {slip.paid_days}/{slip.scheduled_days} paid days</p>
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
                <dd className="font-semibold text-hof">{fmtMoney(value as number)}</dd>
              </div>
            ))}
            <div className="flex justify-between py-3">
              <dt className="font-bold text-hof">Net pay</dt>
              <dd className="text-lg font-extrabold text-hof">{fmtMoney(slip.net_paise)}</dd>
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
