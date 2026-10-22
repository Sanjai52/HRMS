"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { Alert, ErrorState } from "../../../components/feedback";
import { Button, Card, SkeletonRows, StatusPill } from "../../../components/ui";
import { toUserMessage, type UserError } from "../../../lib/errors";
import { authed, fmtDay } from "../../../lib/hr";

const ROLES = ["EMPLOYEE", "MANAGER", "HR", "ADMIN"] as const;

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "Employee",
  MANAGER: "Manager",
  HR: "HR",
  ADMIN: "Admin",
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? "Custom role";
}

interface UserRow {
  user_id: string;
  email: string;
  status: string;
  is_active: boolean;
  created_at: string;
  employee_id: string | null;
  roles: string[];
}

interface DirectoryEntry {
  employee_id: string;
  name: string;
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(0);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<UserError | null>(null);
  const [actionError, setActionError] = useState<UserError | null>(null);
  const [notice, setNotice] = useState("");
  const lookupSequence = useRef(0);
  const mounted = useRef(true);

  async function load() {
    const sequence = ++lookupSequence.current;
    setState("loading");
    setError(null);
    try {
      const data = await authed<{ users: UserRow[]; total: number }>("/api/v1/admin/users?limit=100");
      if (!mounted.current || sequence !== lookupSequence.current) return;
      setRows(data.users);
      setTotal(data.total);
      setDraft(Object.fromEntries(data.users.map((u) => [u.user_id, [...u.roles]])));
      setState("ready");

      // Best-effort name enrichment. The account list is already usable, so a
      // slow or failed directory lookup must not block or error the page.
      void authed<DirectoryEntry[]>("/api/v1/employees?limit=50")
        .then((directory) => {
          if (!mounted.current || sequence !== lookupSequence.current) return;
          setNames(Object.fromEntries(directory.map((entry) => [entry.employee_id, entry.name])));
        })
        .catch(() => {
          if (!mounted.current || sequence !== lookupSequence.current) return;
          setNames({});
        });
    } catch (err) {
      if (!mounted.current || sequence !== lookupSequence.current) return;
      setError(toUserMessage(err, "We couldn't load user accounts"));
      setState("error");
    }
  }

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(userId: string, role: string) {
    setDraft((d) => {
      const cur = d[userId] ?? [];
      const next = cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role];
      return { ...d, [userId]: next };
    });
  }

  async function saveRoles(u: UserRow) {
    setActionError(null);
    setNotice("");
    const roles = draft[u.user_id] ?? [];
    if (roles.length === 0) {
      setActionError({
        kind: "validation",
        title: "We couldn't update this account",
        body: "Keep at least one role.",
        action: "none",
        actionLabel: "Close",
        retryable: false,
      });
      return;
    }
    try {
      await authed(`/api/v1/admin/users/${u.user_id}/roles`, undefined, { method: "PATCH", body: JSON.stringify({ roles }) });
      setNotice(`Roles updated for ${u.email}.`);
      await load();
    } catch (err) {
      setActionError(toUserMessage(err, "We couldn't update this account"));
    }
  }

  async function deactivate(u: UserRow) {
    if (!window.confirm(`Deactivate ${u.email}? They are signed out and blocked from logging in.`)) return;
    setActionError(null);
    setNotice("");
    try {
      await authed(`/api/v1/admin/users/${u.user_id}/deactivate`, undefined, { method: "POST" });
      setNotice(`${u.email} deactivated.`);
      await load();
    } catch (err) {
      setActionError(toUserMessage(err, "We couldn't update this account"));
    }
  }

  return (
    <AppShell title="Users & roles">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-foggy">
          {total} account{total === 1 ? "" : "s"} · showing the newest {rows.length}
        </p>
      </div>

      {notice && (
        <div role="status" className="mb-4 rounded-card border border-success/30 bg-success-soft px-4 py-3 text-sm font-medium text-success">
          {notice}
        </div>
      )}
      {actionError && (
        <Alert tone="danger" title={actionError.title} className="mb-4">
          {actionError.body}
        </Alert>
      )}

      {state === "loading" && <SkeletonRows n={6} />}
      {state === "error" && error && (
        <ErrorState
          title={error.title}
          body={error.body}
          actionLabel={error.actionLabel}
          actionHref={error.action === "signin" ? "/login" : error.action === "back" ? "/dashboard" : undefined}
          onAction={error.action === "signin" || error.action === "back" ? undefined : () => void load()}
        />
      )}
      {state === "ready" && (
        <Card className="divide-y divide-line-soft">
          {rows.map((u) => {
            const selected = draft[u.user_id] ?? [];
            const changed = [...selected].sort().join(",") !== [...u.roles].sort().join(",");
            const name = u.employee_id ? names[u.employee_id] : undefined;
            return (
              <div key={u.user_id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto_auto] lg:items-center">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-hof">{name ?? u.email}</p>
                  <p className="mt-0.5 truncate text-xs text-foggy">
                    {name ? `${u.email} · ` : ""}Joined {fmtDay(u.created_at)}
                    {u.employee_id && (
                      <>
                        {" · "}
                        <Link href={`/hr/employees/${u.employee_id}`} className="font-medium text-primary-ink hover:underline">
                          Employee record
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {ROLES.map((r) => (
                    <label key={r} className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-foggy">
                      <input
                        type="checkbox"
                        checked={selected.includes(r)}
                        onChange={() => toggle(u.user_id, r)}
                        className="h-4 w-4 rounded border-line accent-primary"
                      />
                      {roleLabel(r)}
                    </label>
                  ))}
                </div>
                <StatusPill status={u.is_active ? "Active" : "Deactivated"} />
                <div className="flex items-center gap-2">
                  <Button variant="outline" disabled={!changed || selected.length === 0} onClick={() => saveRoles(u)} className="h-10 px-5 text-sm">
                    Save roles
                  </Button>
                  <Button variant="quiet" disabled={!u.is_active} onClick={() => deactivate(u)} className="h-10 px-5 text-sm">
                    Deactivate
                  </Button>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No accounts yet.</p>}
        </Card>
      )}
    </AppShell>
  );
}
