"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { ErrorState } from "../../../components/feedback";
import { Card, SkeletonRows, StatusPill } from "../../../components/ui";
import { toUserMessage, type UserError } from "../../../lib/errors";
import { employeeLabel, initials } from "../../../lib/format";
import { authed } from "../../../lib/hr";

interface Mate {
  employee_id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  status: string;
}

export default function TeamPage() {
  const [rows, setRows] = useState<Mate[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<UserError | null>(null);

  async function load() {
    setState("loading");
    setError(null);
    try {
      setRows(await authed<Mate[]>("/api/v1/employees/team"));
      setState("ready");
    } catch (err) {
      setError(toUserMessage(err, "We couldn't load your team"));
      setState("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="My team">
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
          {rows.length === 0 && (
            <p className="px-5 py-6 text-sm text-foggy">
              No team members assigned yet. <Link href="/manager/leave" className="font-semibold text-hof underline underline-offset-4">Review leave approvals</Link>
            </p>
          )}
          {rows.map((r) => (
            <Link
              key={r.employee_id}
              href={`/manager/team/${r.employee_id}`}
              className="flex items-center gap-4 px-5 py-4 outline-none transition duration-200 hover:bg-pearl/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-hof/40 active:scale-[0.98]"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-extrabold text-primary-ink">
                {initials(r.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-hof">{employeeLabel(r)}</p>
                <p className="truncate text-sm text-foggy">{r.designation} · {r.department}</p>
              </div>
              <StatusPill status={r.status} />
            </Link>
          ))}
        </Card>
      )}
    </AppShell>
  );
}
