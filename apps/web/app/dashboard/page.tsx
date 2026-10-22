"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CalendarCheck, Suitcase, Wallet, Bell } from "@phosphor-icons/react";
import { AppShell } from "../../components/app-shell";
import { Alert, ErrorState } from "../../components/feedback";
import { Card, SkeletonRows } from "../../components/ui";
import { requestJson, rolesOf } from "../../lib/api";
import { toUserMessage } from "../../lib/errors";
import { employeeLabel, fmtMoney, initials, periodLabel } from "../../lib/format";

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

interface MeResponse {
  name?: string;
}

interface AttendanceToday {
  today?: { check_out?: string | null; status?: string | null } | null;
}

interface UnreadResponse {
  count?: number;
}

type LoadState = "loading" | "signed_out" | "error" | "ready";

export default function Dashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [attendance, setAttendance] = useState<string | null>(null);
  const [leaveLeft, setLeaveLeft] = useState<number | null>(null);
  const [payslip, setPayslip] = useState<Payslip | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorBody, setErrorBody] = useState("");
  const [partial, setPartial] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setPartial(false);
    const token = sessionStorage.getItem("hrms_token");
    if (!token) {
      // No session at all: same session-expired copy as a rejected 401.
      setState("signed_out");
      return;
    }
    const myRoles = rolesOf(token);
    setRoles(myRoles);
    const privileged = myRoles.includes("HR") || myRoles.includes("ADMIN") || myRoles.includes("MANAGER");

    // The profile is the page gate: without it there is nothing to render.
    let me: MeResponse;
    try {
      me = (await requestJson<MeResponse>("/api/v1/employees/me", undefined, token)).data;
    } catch (err) {
      const userError = toUserMessage(err, "We couldn't load your dashboard");
      if (userError.kind === "auth") {
        setState("signed_out");
        return;
      }
      setErrorBody(userError.body);
      setState("error");
      return;
    }
    if (me?.name) setName(me.name);

    // Optional sources: a failure in one must not blank the rest of the page.
    const [att, balances, slips, unreadBody, dir] = await Promise.allSettled([
      requestJson<AttendanceToday>("/api/v1/attendance/me", undefined, token),
      requestJson<Balance[]>("/api/v1/leave/balances", undefined, token),
      requestJson<Payslip[]>("/api/v1/payroll/me", undefined, token),
      requestJson<UnreadResponse>("/api/v1/notifications/unread-count", undefined, token),
      privileged ? requestJson<Row[]>("/api/v1/employees?limit=5", undefined, token) : Promise.resolve(null),
    ]);
    let optionalFailed = false;

    if (att.status === "fulfilled") {
      const today = att.value.data?.today;
      setAttendance(
        today ? (today.check_out ? "Checked out" : today.status === "LATE" ? "Late arrival" : "Checked in") : "Not checked in"
      );
    } else {
      optionalFailed = true;
    }

    if (balances.status === "fulfilled") {
      const leaveRows = balances.value.data ?? [];
      setLeaveLeft(
        leaveRows.length > 0
          ? leaveRows.reduce((sum, b) => sum + Math.max(0, Number(b.total_days) - Number(b.used_days)), 0)
          : null
      );
    } else {
      optionalFailed = true;
    }

    if (slips.status === "fulfilled") {
      setPayslip(slips.value.data?.[0] ?? null);
    } else {
      optionalFailed = true;
    }

    if (unreadBody.status === "fulfilled") {
      setUnread(typeof unreadBody.value.data?.count === "number" ? unreadBody.value.data.count : null);
    } else {
      optionalFailed = true;
    }

    if (dir.status === "fulfilled") {
      if (Array.isArray(dir.value?.data)) setRows(dir.value.data);
    } else {
      optionalFailed = true;
    }

    setPartial(optionalFailed);
    setState("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const privileged = roles.includes("HR") || roles.includes("ADMIN") || roles.includes("MANAGER");
  const roleLabel = roles.includes("ADMIN") ? "Admin" : roles.includes("HR") ? "HR" : roles.includes("MANAGER") ? "Manager" : "";
  const greeting = name ? `Good day, ${name.split(" ")[0]}` : roleLabel ? `Good day, ${roleLabel}` : "Good day";

  return (
    <AppShell title={greeting}>
      {state === "loading" && <SkeletonRows n={4} />}
      {state === "signed_out" && (
        <ErrorState title="Your session has expired" body="Sign in again to continue." actionLabel="Sign in" actionHref="/login" />
      )}
      {state === "error" && (
        <ErrorState
          title="We couldn't load your dashboard"
          body={errorBody}
          actionLabel="Try again"
          onAction={() => void load()}
        />
      )}
      {state === "ready" && (
        <>
          {partial && (
            <Alert
              tone="warning"
              title="Some dashboard details couldn't be loaded."
              action={{ label: "Refresh", onClick: () => void load() }}
              className="mb-4"
            >
              The rest of your workspace is shown. Refresh to try again.
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="flex items-center gap-4 p-5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-card bg-success-soft text-success">
                <CalendarCheck size={24} weight="fill" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foggy">Attendance today</p>
                <p className="truncate text-xl font-extrabold tracking-tight text-hof">{attendance ?? "—"}</p>
              </div>
            </Card>
            <Card className="flex items-center gap-4 p-5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-card bg-warning-soft text-warning">
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
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-card bg-primary-soft text-primary">
                  <Wallet size={24} weight="fill" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foggy">Latest payslip</p>
                  <p className="truncate text-xl font-extrabold tracking-tight text-hof">
                    {payslip ? `${fmtMoney(payslip.net_paise)} · ${periodLabel(payslip.period)}` : "No payslips yet"}
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
                        {initials(employeeLabel(r))}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-hof">{employeeLabel(r)}</p>
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
