"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../components/app-shell";
import { ErrorState } from "../../components/feedback";
import { Card, SkeletonRows } from "../../components/ui";
import { toUserMessage, type UserError } from "../../lib/errors";
import { fmtMoney, periodLabel } from "../../lib/format";
import { authed } from "../../lib/hr";

interface Slip {
  record_id: string;
  period: string;
  net_paise: number;
}

export default function MyPayrollPage() {
  const [rows, setRows] = useState<Slip[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<UserError | null>(null);

  async function load() {
    setState("loading");
    setError(null);
    try {
      setRows(await authed<Slip[]>("/api/v1/payroll/me"));
      setState("ready");
    } catch (err) {
      setError(toUserMessage(err, "We couldn't load your payslips"));
      setState("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="My payroll">
      {state === "loading" && <SkeletonRows n={3} />}
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
        <Card className="max-w-3xl divide-y divide-line-soft">
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No payslips yet.</p>}
          {rows.map((r) => (
            <Link key={r.record_id} href={`/payroll/${r.record_id}`} className="flex items-center gap-3 px-5 py-4 transition hover:bg-pearl/60">
              <p className="min-w-0 flex-1 text-[15px] font-semibold text-hof">Payslip · {periodLabel(r.period)}</p>
              <p className="text-[15px] font-bold text-hof">{fmtMoney(r.net_paise)}</p>
            </Link>
          ))}
        </Card>
      )}
    </AppShell>
  );
}
