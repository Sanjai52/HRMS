"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { AppShell } from "../../components/app-shell";
import { Card, SkeletonRows } from "../../components/ui";

interface Row {
  employee_id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  status: string;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function Dashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    const token = sessionStorage.getItem("hrms_token");
    if (!token) {
      setState("error");
      return;
    }
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
    fetch(`${base}/api/v1/employees?limit=5`, { headers: { authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error("directory-fetch-failed");
        const body = await r.json();
        setRows(body.data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  return (
    <AppShell title="Good day, HR">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["People directory", state === "ready" ? String(rows.length) : "—", "Live from the catalog"],
          ["Attendance today", "Phase 4", "Check-in flow lands next"],
          ["Open leave requests", "Phase 4", "Approval chain lands next"],
        ].map(([k, v, hint]) => (
          <Card key={k} className="p-5">
            <p className="text-sm font-medium text-foggy">{k}</p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight text-hof">{v}</p>
            <p className="mt-1 text-[13px] text-foggy">{hint}</p>
          </Card>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-bold text-hof">Recently added people</h2>
        <Link
          href="/hr/employees"
          className="inline-flex items-center gap-1 text-sm font-semibold text-hof underline-offset-4 hover:underline"
        >
          View directory <ArrowRight size={16} />
        </Link>
      </div>
      <div className="mt-3">
        {state === "loading" && <SkeletonRows n={4} />}
        {state === "error" && (
          <Card className="p-8 text-center">
            <p className="font-semibold text-hof">You are signed out</p>
            <p className="mt-1 text-sm text-foggy">Log in to see your workspace.</p>
            <Link
              href="/login"
              className="mt-4 inline-flex h-11 items-center rounded-full bg-rausch px-6 text-sm font-semibold text-white hover:bg-rausch-dark"
            >
              Go to login
            </Link>
          </Card>
        )}
        {state === "ready" && (
          <Card className="divide-y divide-line-soft">
            {rows.map((r) => (
              <div key={r.employee_id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-hof text-sm font-bold text-white">
                  {initials(r.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-hof">{r.name}</p>
                  <p className="truncate text-sm text-foggy">
                    {r.designation} · {r.department}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </AppShell>
  );
}
