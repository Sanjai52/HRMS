"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { Card, SkeletonRows, StatusPill } from "../../../components/ui";
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

  useEffect(() => {
    authed<Mate[]>("/api/v1/employees/team")
      .then((data) => {
        setRows(data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  return (
    <AppShell title="My team">
      {state === "loading" && <SkeletonRows n={4} />}
      {state === "error" && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Could not load your team</p>
        </Card>
      )}
      {state === "ready" && (
        <Card className="divide-y divide-line-soft">
          {rows.length === 0 && (
            <p className="px-5 py-6 text-sm text-foggy">
              No team members assigned yet. <Link href="/manager/leave" className="font-semibold text-hof underline underline-offset-4">Review leave approvals</Link>
            </p>
          )}
          {rows.map((r) => (
            <div key={r.employee_id} className="flex items-center gap-4 px-5 py-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rausch/10 text-sm font-extrabold text-rausch-dark">
                {r.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-hof">{r.name}</p>
                <p className="truncate text-sm text-foggy">{r.designation} · {r.department}</p>
              </div>
              <StatusPill status={r.status} />
            </div>
          ))}
        </Card>
      )}
    </AppShell>
  );
}
