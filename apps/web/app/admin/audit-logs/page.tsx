"use client";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { ErrorState } from "../../../components/feedback";
import { Card, Select, SkeletonRows } from "../../../components/ui";
import { toUserMessage, type UserError } from "../../../lib/errors";
import { authed } from "../../../lib/hr";
import { fmtDateTime } from "../../../lib/format";

interface Row {
  event_id: string;
  actor: string;
  action: string;
  resource: string;
  timestamp: string;
}

interface UserLookup {
  user_id: string;
  email: string;
}

interface DirectoryEntry {
  email: string;
  name: string;
}

const ACTION_FILTERS: Array<{ label: string; value: string }> = [
  { label: "All activity", value: "" },
  { label: "Leave decided", value: "leave.decided" },
  { label: "Leave cancelled", value: "leave.cancelled" },
  { label: "Employee updated", value: "employee.updated" },
  { label: "Employee onboarded", value: "employee.onboarded" },
  { label: "Account roles changed", value: "admin.roles_changed" },
  { label: "Account deactivated", value: "admin.user_deactivated" },
  { label: "Salary structure updated", value: "payroll.structure_updated" },
  { label: "Performance review submitted", value: "perf.review_submitted" },
  { label: "Job opening created", value: "job.created" },
  { label: "Migration completed", value: "migration.completed" },
];

const ACTION_LABELS: Record<string, string> = {
  "directory.rebuilt": "Employee directory rebuilt",
  "migration.previewed": "Migration previewed",
  "migration.started": "Migration started",
  "migration.failed": "Migration failed",
  "migration.abort_refused": "Migration stop declined",
  "migration.aborted": "Migration stopped",
  "migration.smoke_failed": "Migration check failed",
  "migration.completed": "Migration completed",
  "settings.department_added": "Department added",
  "settings.designation_added": "Designation added",
  "admin.roles_changed": "Account roles changed",
  "admin.user_deactivated": "Account deactivated",
  "application.stage": "Application stage changed",
  "interview.created": "Interview scheduled",
  "interview.updated": "Interview updated",
  "assessment.completed": "Assessment completed",
  "candidate.converted": "Candidate invited",
  "invitation.created": "Invitation sent",
  "invitation.accepted": "Invitation accepted",
  "password.reset_requested": "Password reset requested",
  "password.reset": "Password reset",
  "employee.profile_updated": "Employee profile updated",
  "employee.onboarded": "Employee onboarded",
  "employee.updated": "Employee updated",
  "employee.deactivated": "Employee deactivated",
  "attendance.corrected": "Attendance corrected",
  "job.created": "Job opening created",
  "job.closed": "Job opening closed",
  "shortlink.created": "Short link created",
  "leave.cancelled": "Leave request cancelled",
  "leave.decided": "Leave request decided",
  "leave.override": "Leave decision overridden",
  "payroll.structure_updated": "Salary structure updated",
  "announcement.created": "Announcement published",
  "perf.cycle_created": "Review cycle created",
  "perf.cycle_closed": "Review cycle closed",
  "perf.review_submitted": "Performance review submitted",
  "perf.review_released": "Performance review shared",
  "crawl.started": "Sourcing run started",
  "crawl.failed": "Sourcing run failed",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? "Activity recorded";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function targetLabel(resource: string): string {
  const raw = (resource ?? "").trim();
  const [type, value] = raw.split(":");
  switch (type) {
    case "employee":
      return "Employee record";
    case "leave":
      return "Leave request";
    case "user":
      return "User account";
    case "application":
      return "Application";
    case "interview":
      return "Interview";
    case "assessment":
      return "Assessment";
    case "candidate":
      return "Candidate";
    case "job":
      return "Job opening";
    case "cycle":
      return "Review cycle";
    case "review":
      return "Performance review";
    case "migration":
      return "Database migration";
    case "crawl":
      return "Sourcing run";
    case "invitation":
      return "Invitation";
    case "department":
      return value && !UUID_RE.test(value) ? `Department · ${value}` : "Department";
    case "designation":
      return value && !UUID_RE.test(value) ? `Designation · ${value}` : "Designation";
    case "short":
      return "Short link";
    case "employee_directory":
      return "Employee directory";
    default:
      return "System record";
  }
}

export default function AuditLogsPage() {
  const [action, setAction] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const [directoryNames, setDirectoryNames] = useState<Record<string, string>>({});
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<UserError | null>(null);
  const lookupSequence = useRef(0);
  const mounted = useRef(true);

  async function load(a: string) {
    const sequence = ++lookupSequence.current;
    setState("loading");
    setError(null);
    try {
      const query = a ? `?action=${encodeURIComponent(a)}&limit=50` : "?limit=50";
      const events = await authed<Row[]>(`/api/v1/admin/audit-logs${query}`);
      if (!mounted.current || sequence !== lookupSequence.current) return;
      setRows(events);
      setState("ready");

      // Name enrichment is best effort. The audit rows are already usable, and
      // a slow or failed lookup must not block them or surface an error.
      void authed<{ users: UserLookup[] }>("/api/v1/admin/users?limit=100")
        .then((users) => {
          if (!mounted.current || sequence !== lookupSequence.current) return;
          setActorNames(Object.fromEntries(users.users.map((u) => [u.user_id, u.email])));
        })
        .catch(() => {
          if (!mounted.current || sequence !== lookupSequence.current) return;
          setActorNames({});
        });

      void authed<DirectoryEntry[]>("/api/v1/employees?limit=50")
        .then((directory) => {
          if (!mounted.current || sequence !== lookupSequence.current) return;
          setDirectoryNames(Object.fromEntries(directory.map((entry) => [entry.email.toLowerCase(), entry.name])));
        })
        .catch(() => {
          if (!mounted.current || sequence !== lookupSequence.current) return;
          setDirectoryNames({});
        });
    } catch (err) {
      if (!mounted.current || sequence !== lookupSequence.current) return;
      setError(toUserMessage(err, "We couldn't load the audit log"));
      setState("error");
    }
  }

  useEffect(() => {
    mounted.current = true;
    void load("");
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function actorLabel(actor: string): string {
    if (!actor) return "System";
    const email = actorNames[actor];
    if (!email) return "Team member";
    return directoryNames[email.toLowerCase()] ?? email;
  }

  return (
    <AppShell title="Audit log">
      <form onSubmit={(e) => { e.preventDefault(); void load(action); }} className="mb-4 flex max-w-lg gap-2">
        <Select aria-label="Filter by activity" value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTION_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
        <button type="submit" className="h-12 shrink-0 rounded-full bg-hof px-6 text-[15px] font-semibold text-white outline-none transition duration-200 hover:bg-black focus-visible:ring-2 focus-visible:ring-hof focus-visible:ring-offset-2 active:scale-[0.98]">
          Filter
        </button>
      </form>
      {state === "loading" && <SkeletonRows n={5} />}
      {state === "error" && error && (
        <ErrorState
          title={error.title}
          body={error.body}
          actionLabel={error.actionLabel}
          actionHref={error.action === "signin" ? "/login" : error.action === "back" ? "/dashboard" : undefined}
          onAction={error.action === "signin" || error.action === "back" ? undefined : () => void load(action)}
        />
      )}
      {state === "ready" && (
        <Card className="divide-y divide-line-soft">
          {rows.length === 0 && (
            <p className="px-5 py-6 text-sm text-foggy">
              {action ? "No activity matches this filter." : "No audit events yet."}
            </p>
          )}
          {rows.map((r) => (
            <div key={r.event_id} className="px-5 py-3.5">
              <p className="text-[15px] font-semibold text-hof">{actionLabel(r.action)}</p>
              <p className="truncate text-sm tabular-nums text-foggy">
                {actorLabel(r.actor)} · {targetLabel(r.resource)} · {fmtDateTime(r.timestamp)}
              </p>
            </div>
          ))}
        </Card>
      )}
    </AppShell>
  );
}
