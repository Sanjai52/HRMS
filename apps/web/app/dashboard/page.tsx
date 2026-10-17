"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarCheck, Suitcase, Wallet, Bell } from "@phosphor-icons/react";
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

interface Balance {
  leave_type: string;
  total_days: number;
  used_days: number;
}

interface Payslip {
  record_id: string;
  period: string;
  net_paise: number;
}

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function Dashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [attendance, setAttendance] = useState<string | null>(null);
  const [leaveLeft, setLeaveLeft] = useState<number | null>(null);
  const [payslip, setPayslip] = useState<Payslip | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    const token = sessionStorage.getItem("hrms_token");
    if (!token) {
      setState("error");
      return;
    }
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
    const auth = { authorization: `Bearer ${token}` };
    const myRoles = rolesOf(token);
    setRoles(myRoles);
    const privileged = myRoles.includes("HR") || myRoles.includes("ADMIN") || myRoles.includes("MANAGER");
    const get = (path: string) =>
      fetch(`${base}${path}`, { headers: auth })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    Promise.all([
      get("/api/v1/employees/me"),
      get("/api/v1/attendance/me"),
      get("/api/v1/leave/balances"),
      get("/api/v1/payroll/me"),
      get("/api/v1/notifications/unread-count"),
      privileged ? get("/api/v1/employees?limit=5") : Promise.resolve(null),
    ]).then(([me, att, balances, slips, unreadBody, dir]) => {
      if (me?.data?.name) setName(me.data.name as string);
      const today = att?.data?.today;
      setAttendance(
        today ? (today.check_out ? "Checked out" : today.status === "LATE" ? "Late arrival" : "Checked in") : "Not checked in"
      );
      const leaveRows = (balances?.data ?? []) as Balance[];
      setLeaveLeft(
        leaveRows.length > 0
          ? leaveRows.reduce((sum, b) => sum + Math.max(0, Number(b.total_days) - Number(b.used_days)), 0)
          : null
      );
      const slipsRows = (slips?.data ?? []) as Payslip[];
      setPayslip(slipsRows[0] ?? null);
      setUnread(typeof unreadBody?.data?.count === "number" ? (unreadBody.data.count as number) : null);
      if (Array.isArray(dir?.data)) setRows(dir.data as Row[]);
      setState("ready");
    });
  }, []);

  const privileged = roles.includes("HR") || roles.includes("ADMIN") || roles.includes("MANAGER");
  const roleLabel = roles.includes("ADMIN") ? "Admin" : roles.includes("HR") ? "HR" : roles.includes("MANAGER") ? "Manager" : "";
  const greeting = name ? `Good day, ${name.split(" ")[0]}` : roleLabel ? `Good day, ${roleLabel}` : "Good day";

  return (
    <AppShell title={greeting}>
      {state === "error" && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">You are signed out</p>
          <p className="mt-1 text-sm text-foggy">Log in to see your workspace.</p>
          <Link href="/login" className="mt-4 inline-flex h-11 items-center rounded-full bg-rausch px-6 text-sm font-semibold text-white hover:bg-rausch-dark">
            Go to login
          </Link>
        </Card>
      )}
      {state === "loading" && <SkeletonRows n={4} />}
      {state === "ready" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="flex items-center gap-4 p-5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-card bg-babu/10 text-babu">
                <CalendarCheck size={24} weight="fill" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foggy">Attendance today</p>
                <p className="truncate text-xl font-extrabold tracking-tight text-hof">{attendance ?? "—"}</p>
              </div>
            </Card>
            <Card className="flex items-center gap-4 p-5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-card bg-arches/10 text-arches">
                <Suitcase size={24} weight="fill" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foggy">Leave balance</p>
                <p className="truncate text-xl font-extrabold tracking-tight text-hof">
                  {leaveLeft === null ? "—" : `${leaveLeft} day${leaveLeft === 1 ? "" : "s"} left`}
                </p>
              </div>
            </Card>
            <Link href="/payroll">
              <Card className="flex items-center gap-4 p-5 transition hover:shadow-pop">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-card bg-rausch/10 text-rausch">
                  <Wallet size={24} weight="fill" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foggy">Latest payslip</p>
                  <p className="truncate text-xl font-extrabold tracking-tight text-hof">
                    {payslip ? `${rupees(payslip.net_paise)} · ${payslip.period}` : "No payslips yet"}
                  </p>
                </div>
              </Card>
            </Link>
            <Link href="/notifications">
              <Card className="flex items-center gap-4 p-5 transition hover:shadow-pop">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-card bg-hof/10 text-hof">
                  <Bell size={24} weight="fill" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foggy">Unread notifications</p>
                  <p className="truncate text-xl font-extrabold tracking-tight text-hof">
                    {unread === null ? "—" : unread}
                  </p>
                </div>
              </Card>
            </Link>
          </div>

          {privileged && (
            <>
              <div className="mt-8 flex items-center justify-between">
                <h2 className="text-lg font-bold text-hof">Recently added people</h2>
                <Link href="/hr/employees" className="inline-flex items-center gap-1 text-sm font-semibold text-hof underline-offset-4 hover:underline">
                  View directory <ArrowRight size={16} />
                </Link>
              </div>
              <div className="mt-3">
                <Card className="divide-y divide-line-soft">
                  {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No people in the directory yet.</p>}
                  {rows.map((r) => (
                    <Link key={r.employee_id} href={`/hr/employees/${r.employee_id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-pearl/60">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-hof text-sm font-bold text-white">
                        {initials(r.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-hof">{r.name}</p>
                        <p className="truncate text-sm text-foggy">{r.designation} · {r.department}</p>
                      </div>
                    </Link>
                  ))}
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
