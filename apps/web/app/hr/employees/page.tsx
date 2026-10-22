"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "../../../components/app-shell";
import { ErrorState } from "../../../components/feedback";
import { Card, SkeletonRows, StatusPill, TextInput } from "../../../components/ui";
import { toUserMessage, type UserError } from "../../../lib/errors";
import { employeeLabel, initials } from "../../../lib/format";
import { authed } from "../../../lib/hr";

interface Row {
  employee_id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  status: string;
}

function Directory() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<UserError | null>(null);

  async function load(query: string) {
    setState("loading");
    setError(null);
    try {
      const data = await authed<Row[]>(`/api/v1/employees?q=${encodeURIComponent(query)}&limit=30`);
      setRows(data);
      setState("ready");
    } catch (err) {
      setError(toUserMessage(err, "We couldn't load your team"));
      setState("error");
    }
  }

  useEffect(() => {
    load(params.get("q") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Employee directory">
      <div className="flex max-w-2xl flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(q);
          }}
          className="flex min-w-0 flex-1 gap-2"
        >
          <TextInput aria-label="Search employees" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" />
          <button
            type="submit"
            className="h-12 shrink-0 rounded-full bg-hof px-6 text-[15px] font-semibold text-white transition hover:bg-black active:scale-[0.98]"
          >
            Search
          </button>
        </form>
        <Link
          href="/hr/employees/new"
          className="inline-flex h-12 shrink-0 items-center rounded-full bg-primary px-6 text-[15px] font-semibold text-white transition hover:bg-primary-hover active:scale-[0.98]"
        >
          Add employee
        </Link>
      </div>

      <div className="mt-5">
        {state === "loading" && <SkeletonRows n={6} />}
        {state === "error" && error && (
          <ErrorState
            title={error.title}
            body={error.body}
            actionLabel={error.actionLabel}
            actionHref={error.action === "signin" ? "/login" : error.action === "back" ? "/dashboard" : undefined}
            onAction={error.action === "signin" || error.action === "back" ? undefined : () => void load(q)}
          />
        )}
        {state === "ready" && (
          <Card className="divide-y divide-line-soft">
            {rows.length === 0 && <p className="px-5 py-8 text-center text-sm text-foggy">No people match that search.</p>}
            {rows.map((r) => (
              <Link key={r.employee_id} href={`/hr/employees/${r.employee_id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-pearl/60">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-extrabold text-primary-ink">
                  {initials(r.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-hof">{employeeLabel(r)}</p>
                  <p className="truncate text-sm text-foggy">
                    {r.designation} · {r.department} · {r.email}
                  </p>
                </div>
                <StatusPill status={r.status} />
              </Link>
            ))}
          </Card>
        )}
      </div>
    </AppShell>
  );
}

export default function EmployeeDirectoryPage() {
  return (
    <Suspense>
      <Directory />
    </Suspense>
  );
}
