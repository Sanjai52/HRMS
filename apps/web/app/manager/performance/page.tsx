"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { Button, Card, SkeletonRows, StatusPill } from "../../../components/ui";
import { authed } from "../../../lib/hr";

interface Mate {
  employee_id: string;
  name: string;
  designation: string;
  department: string;
  status: string;
}

export default function ManagerPerformancePage() {
  const [rows, setRows] = useState<Mate[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  async function load() {
    setState("loading");
    try {
      setRows(await authed<Mate[]>("/api/v1/employees/team"));
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Team performance">
      {state === "loading" && <SkeletonRows n={4} />}
      {state === "error" && (
        <Card className="p-8 text-center">
          <p className="text-balance text-[15px] font-semibold text-hof">Could not load your team</p>
          <p className="mt-1 text-sm text-foggy">Check your connection and try again.</p>
          <Button variant="outline" className="mt-4 h-10 px-5 text-sm" onClick={load}>
            Try again
          </Button>
        </Card>
      )}
      {state === "ready" && (
        <Card className="divide-y divide-line-soft">
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No team members assigned yet.</p>}
          {rows.map((r) => (
            <Link key={r.employee_id} href={`/manager/performance/${r.employee_id}`} className="flex items-center gap-4 px-5 py-4 outline-none transition duration-200 hover:bg-pearl/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-hof/40 active:scale-[0.98]">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rausch/10 text-sm font-semibold text-rausch-dark">
                {r.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-hof">{r.name}</p>
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
