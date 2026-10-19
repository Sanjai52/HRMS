"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ChartLineUp } from "@phosphor-icons/react";
import { AppShell } from "../../../../components/app-shell";
import { Card, SkeletonRows, StatusPill } from "../../../../components/ui";
import { authed, fmtDay, fmtTime } from "../../../../lib/hr";

interface Employee {
  employee_id: string;
  display_id: string;
  email: string;
  name: string;
  department: string;
  designation: string;
  status: string;
  manager_id: string | null;
  version: number;
}

interface AttendanceRow {
  workday: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
}

interface LeaveRow {
  request_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  workdays: number;
  status: string;
}

interface Activity {
  attendance: AttendanceRow[];
  leave: LeaveRow[];
  payroll: unknown[];
}

export default function TeamMemberDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [emp, setEmp] = useState<Employee | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      authed<Employee>(`/api/v1/employees/${id}`),
      authed<Activity>(`/api/v1/employees/${id}/activity`),
    ])
      .then(([profile, act]) => {
        if (cancelled) return;
        setEmp(profile);
        setActivity(act);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <AppShell title={emp ? emp.name : "Team member"}>
      {!emp && !error && <SkeletonRows n={3} />}
      {error && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Could not open this team member</p>
          <p className="mt-1 text-sm text-foggy">{error}</p>
          <Link href="/manager/team" className="mt-4 inline-block text-sm font-semibold text-hof underline underline-offset-4">
            Back to my team
          </Link>
        </Card>
      )}
      {emp && (
        <div className="grid max-w-3xl gap-6">
          <Card className="flex flex-wrap items-center gap-4 p-6">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-rausch/10 text-lg font-extrabold text-rausch-dark">
              {emp.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-extrabold text-hof">{emp.name}</p>
              <p className="truncate text-sm text-foggy">
                {emp.designation} · {emp.department}
              </p>
              <p className="truncate text-sm text-foggy">{emp.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill status={emp.status} />
              <Link
                href={`/manager/performance/${emp.employee_id}`}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-hof transition hover:bg-pearl active:scale-[0.98]"
              >
                <ChartLineUp size={16} />
                Performance
              </Link>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-bold text-hof">Recent attendance</h2>
            {!activity && <div className="mt-3"><SkeletonRows n={2} /></div>}
            {activity && activity.attendance.length === 0 && (
              <p className="mt-3 text-sm text-foggy">No attendance recorded yet.</p>
            )}
            {activity && activity.attendance.length > 0 && (
              <div className="mt-3 divide-y divide-line-soft">
                {activity.attendance.slice(0, 10).map((a) => (
                  <div key={a.workday} className="flex items-center gap-3 py-2.5">
                    <p className="min-w-0 flex-1 text-sm font-semibold text-hof">{fmtDay(a.workday)}</p>
                    <p className="text-sm text-foggy">
                      {fmtTime(a.check_in)} – {fmtTime(a.check_out)}
                    </p>
                    <StatusPill status={a.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-bold text-hof">Leave history</h2>
            {!activity && <div className="mt-3"><SkeletonRows n={2} /></div>}
            {activity && activity.leave.length === 0 && <p className="mt-3 text-sm text-foggy">No leave requests yet.</p>}
            {activity && activity.leave.length > 0 && (
              <div className="mt-3 divide-y divide-line-soft">
                {activity.leave.map((l) => (
                  <div key={l.request_id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <p className="min-w-0 flex-1 text-sm font-semibold capitalize text-hof">{l.leave_type.toLowerCase()}</p>
                    <p className="text-sm text-foggy">
                      {fmtDay(l.start_date)} – {fmtDay(l.end_date)} · {l.workdays}d
                    </p>
                    <StatusPill status={l.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
