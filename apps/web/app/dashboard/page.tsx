"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Users, CalendarCheck, Suitcase } from "@phosphor-icons/react";
import { AppShell } from "../../components/app-shell";
import { Card, SkeletonRows } from "../../components/ui";
import { rolesOf } from "../../lib/api";

interface Row {
  employee_id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  status: string;
}

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function Dashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [attendance, setAttendance] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    const token = sessionStorage.getItem("hrms_token");
    if (!token) {
      setState("error");
      return;
    }
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
    const auth = { authorization: `Bearer ${token}` };
    const roles = rolesOf(token);
    const privileged = roles.includes("HR") || roles.includes("ADMIN") || roles.includes("MANAGER");
    Promise.all([
      fetch(`${base}/api/v1/employees?limit=5`, { headers: auth }).then((r) => {
        if (!r.ok) throw new Error("directory");
        return r.json();
      }),
      fetch(`${base}/api/v1/attendance/me`, { headers: auth }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${base}/api/v1/leave/requests${privileged ? "" : "?mine=true"}`, { headers: auth }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([dir, att, leave]) => {
        setRows(dir.data);
        const today = att?.data?.today;
        setAttendance(today ? (today.check_out ? "Checked out" : today.status === "LATE" ? "Late arrival" : "Checked in") : "Not checked in");
        const list = leave?.data ?? [];
        setPending(list.filter((x: { status: string }) => x.status === "PENDING_MANAGER" || x.status === "PENDING_HR").length);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  return (
    <AppShell title="Good day, HR">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-4 p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-card bg-rausch/10 text-rausch">
            <Users size={24} weight="fill" />
          </span>
          <div>
            <p className="text-sm font-medium text-foggy">People in your organization</p>
            <p className="text-3xl font-extrabold tracking-tight text-hof">{state === "ready" ? rows.length : "—"}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-card bg-babu/10 text-babu">
            <CalendarCheck size={24} weight="fill" />
          </span>
          <div>
            <p className="text-sm font-medium text-foggy">Attendance today</p>
            <p className="text-xl font-extrabold tracking-tight text-hof">{state === "ready" ? attendance : "—"}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-card bg-arches/10 text-arches">
            <Suitcase size={24} weight="fill" />
          </span>
          <div>
            <p className="text-sm font-medium text-foggy">Leave awaiting decision</p>
            <p className="text-3xl font-extrabold tracking-tight text-hof">{state === "ready" && pending !== null ? pending : "—"}</p>
          </div>
        </Card>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-bold text-hof">Recently added people</h2>
        <Link href="/hr/employees" className="inline-flex items-center gap-1 text-sm font-semibold text-hof underline-offset-4 hover:underline">
          View directory <ArrowRight size={16} />
        </Link>
      </div>
      <div className="mt-3">
        {state === "loading" && <SkeletonRows n={4} />}
        {state === "error" && (
          <Card className="p-8 text-center">
            <p className="font-semibold text-hof">You are signed out</p>
            <p className="mt-1 text-sm text-foggy">Log in to see your workspace.</p>
            <Link href="/login" className="mt-4 inline-flex h-11 items-center rounded-full bg-rausch px-6 text-sm font-semibold text-white hover:bg-rausch-dark">
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
                  <p className="truncate text-sm text-foggy">{r.designation} · {r.department}</p>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </AppShell>
  );
}
