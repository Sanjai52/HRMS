"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ChartLineUp } from "@phosphor-icons/react";
import { AppShell } from "../../../../components/app-shell";
import { Alert, ErrorState } from "../../../../components/feedback";
import { Card, SkeletonRows, StatusPill } from "../../../../components/ui";
import { toUserMessage, type UserError } from "../../../../lib/errors";
import { employeeLabel, fmtDay, fmtTime, initials } from "../../../../lib/format";
import { authed } from "../../../../lib/hr";

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
  const [error, setError] = useState<UserError | null>(null);
  const [activityError, setActivityError] = useState<UserError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setEmp(null);
    setActivity(null);
    setError(null);
    setActivityError(null);
    authed<Employee>(`/api/v1/employees/${id}`)
      .then((profile) => {
        if (!cancelled) setEmp(profile);
      })
      .catch((err) => {
        if (!cancelled) setError(toUserMessage(err, "We couldn't open this team member"));
      });
    authed<Activity>(`/api/v1/employees/${id}/activity`)
      .then((act) => {
        if (!cancelled) setActivity(act);
      })
      .catch((err) => {
        if (!cancelled) setActivityError(toUserMessage(err, "We couldn't load this team member's activity"));
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  const backToTeam = error?.action === "back";

  return (
    <AppShell title={emp ? employeeLabel(emp) : "Team member"}>
      {!emp && !error && <SkeletonRows n={3} />}
      {error && (
        <ErrorState
          title={error.title}
          body={error.body}
          actionLabel={backToTeam ? "Back to my team" : error.actionLabel}
          actionHref={
            error.action === "signin" ? "/login" : backToTeam ? "/manager/team" : undefined
          }
          onAction={
            error.action === "signin" || backToTeam
              ? undefined
              : () => setReloadKey((current) => current + 1)
          }
          secondaryLabel={backToTeam ? undefined : "Back to my team"}
          secondaryHref={backToTeam ? undefined : "/manager/team"}
        />
      )}
      {emp && (
        <div className="grid max-w-3xl gap-6">
          <Card className="flex flex-wrap items-center gap-4 p-6">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-lg font-extrabold text-primary-ink">
              {initials(emp.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-extrabold text-hof">{employeeLabel(emp)}</p>
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

          {activityError && (
            <Alert
              tone="warning"
              title={activityError.title}
              action={{ label: "Try again", onClick: () => setReloadKey((current) => current + 1) }}
            >
              {activityError.body}
            </Alert>
          )}

          {!activityError && (
            <>
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
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
