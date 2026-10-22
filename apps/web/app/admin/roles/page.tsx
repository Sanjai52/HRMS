"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { ErrorState } from "../../../components/feedback";
import { Card, SkeletonRows } from "../../../components/ui";
import { toUserMessage, type UserError } from "../../../lib/errors";
import { authed } from "../../../lib/hr";

const ROLES = ["EMPLOYEE", "MANAGER", "HR", "ADMIN"] as const;

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "Employee",
  MANAGER: "Manager",
  HR: "HR",
  ADMIN: "Admin",
};

const MATRIX: Array<{ capability: string; employee: string; manager: string; hr: string; admin: string }> = [
  { capability: "View/edit own permitted profile fields", employee: "Yes", manager: "Yes", hr: "Yes", admin: "Yes" },
  { capability: "View another employee's full profile", employee: "No", manager: "Assigned team, limited fields", hr: "Yes", admin: "Yes, audited" },
  { capability: "View own payslips", employee: "Yes", manager: "Yes", hr: "Yes", admin: "Yes" },
  { capability: "View another person's salary/payroll", employee: "No", manager: "No by default", hr: "Yes", admin: "Yes, audited" },
  { capability: "Check in/out and view own attendance", employee: "Yes", manager: "Yes", hr: "Yes", admin: "Yes" },
  { capability: "View team attendance", employee: "No", manager: "Assigned team", hr: "Organization-wide", admin: "Organization-wide" },
  { capability: "Apply for own leave", employee: "Yes", manager: "Yes", hr: "Yes", admin: "Yes" },
  { capability: "Approve leave", employee: "No", manager: "Assigned team, first-level approval", hr: "Final/override authority", admin: "Policy/exception authority" },
  { capability: "Manage employees", employee: "No", manager: "Limited team information", hr: "Yes", admin: "Yes" },
  { capability: "Run/approve payroll batches", employee: "No", manager: "No", hr: "Yes", admin: "Yes" },
  { capability: "Manage jobs/candidates/recruitment", employee: "No", manager: "No by default", hr: "Yes", admin: "Yes" },
  { capability: "Submit/view performance review", employee: "Own view", manager: "Assigned team", hr: "Organization-wide", admin: "Organization-wide" },
  { capability: "Manage users/roles/system config", employee: "No", manager: "No", hr: "Limited if explicitly granted", admin: "Yes" },
  { capability: "View system health/audit logs", employee: "No", manager: "No", hr: "No by default", admin: "Yes" },
];

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? "Custom role";
}

function verdictClass(value: string): string {
  if (value === "No" || value.startsWith("No ")) return "text-foggy";
  if (value === "Yes" || value.startsWith("Yes")) return "font-semibold text-success";
  return "text-hof";
}

export default function AdminRolesPage() {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<UserError | null>(null);

  async function load() {
    setState("loading");
    setError(null);
    try {
      const data = await authed<{ roleCounts: Record<string, number> }>("/api/v1/admin/users?limit=1");
      setCounts(data.roleCounts);
      setState("ready");
    } catch (err) {
      setError(toUserMessage(err, "We couldn't load roles"));
      setState("error");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Roles & permissions">
      <p className="mb-5 max-w-[70ch] text-sm leading-relaxed text-foggy">
        Read-only reference of what each role can do. Access rules are enforced on every request; what you see in the sidebar is not authorization.
      </p>

      {state === "error" && error && (
        <ErrorState
          title={error.title}
          body={error.body}
          actionLabel={error.actionLabel}
          actionHref={error.action === "signin" ? "/login" : error.action === "back" ? "/dashboard" : undefined}
          onAction={error.action === "signin" || error.action === "back" ? undefined : () => void load()}
        />
      )}
      {state !== "error" && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {ROLES.map((r) => (
              <Card key={r} className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-foggy">{roleLabel(r)}</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums text-hof">{counts ? counts[r] ?? 0 : "—"}</p>
                <p className="text-xs text-foggy">account{counts && (counts[r] ?? 0) === 1 ? "" : "s"}</p>
              </Card>
            ))}
          </div>

          {state === "loading" && <SkeletonRows n={6} />}
          {state === "ready" && (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line-soft text-left">
                    <th scope="col" className="px-5 py-3 font-semibold text-hof">Capability</th>
                    {ROLES.map((r) => (
                      <th key={r} scope="col" className="px-4 py-3 font-semibold text-hof">{roleLabel(r)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MATRIX.map((row) => (
                    <tr key={row.capability} className="border-b border-line-soft/60 align-top last:border-b-0">
                      <th scope="row" className="px-5 py-3 text-left font-medium text-hof">{row.capability}</th>
                      <td className={`px-4 py-3 ${verdictClass(row.employee)}`}>{row.employee}</td>
                      <td className={`px-4 py-3 ${verdictClass(row.manager)}`}>{row.manager}</td>
                      <td className={`px-4 py-3 ${verdictClass(row.hr)}`}>{row.hr}</td>
                      <td className={`px-4 py-3 ${verdictClass(row.admin)}`}>{row.admin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </AppShell>
  );
}
