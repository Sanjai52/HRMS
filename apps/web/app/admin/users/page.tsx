"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { Button, Card, SkeletonRows, StatusPill } from "../../../components/ui";
import { authed, fmtDay } from "../../../lib/hr";

const ROLES = ["EMPLOYEE", "MANAGER", "HR", "ADMIN"] as const;

interface UserRow {
  user_id: string;
  email: string;
  status: string;
  is_active: boolean;
  created_at: string;
  employee_id: string | null;
  roles: string[];
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setState("loading");
    try {
      const data = await authed<{ users: UserRow[]; total: number }>("/api/v1/admin/users?limit=100");
      setRows(data.users);
      setTotal(data.total);
      setDraft(Object.fromEntries(data.users.map((u) => [u.user_id, [...u.roles]])));
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggle(userId: string, role: string) {
    setDraft((d) => {
      const cur = d[userId] ?? [];
      const next = cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role];
      return { ...d, [userId]: next };
    });
  }

  async function saveRoles(u: UserRow) {
    setError("");
    setNotice("");
    const roles = draft[u.user_id] ?? [];
    if (roles.length === 0) {
      setError("Keep at least one role.");
      return;
    }
    try {
      await authed(`/api/v1/admin/users/${u.user_id}/roles`, undefined, { method: "PATCH", body: JSON.stringify({ roles }) });
      setNotice(`Roles updated for ${u.email}.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deactivate(u: UserRow) {
    if (!window.confirm(`Deactivate ${u.email}? They are signed out and blocked from logging in.`)) return;
    setError("");
    setNotice("");
    try {
      await authed(`/api/v1/admin/users/${u.user_id}/deactivate`, undefined, { method: "POST" });
      setNotice(`${u.email} deactivated.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
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
        <div role="status" className="mb-4 rounded-card border border-babu/30 bg-babu/10 px-4 py-3 text-sm font-medium text-babu">
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="mb-4 rounded-card border border-rausch/30 bg-rausch/10 px-4 py-3 text-sm font-medium text-rausch-dark">
          {error}
        </div>
      )}

      {state === "loading" && <SkeletonRows n={6} />}
      {state === "error" && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Restricted area</p>
          <p className="mt-1 text-sm text-foggy">Admin access required.</p>
          <Button variant="quiet" onClick={load} className="mt-4 h-10 px-5 text-sm">
            Try again
          </Button>
        </Card>
      )}
      {state === "ready" && (
        <Card className="divide-y divide-line-soft">
          {rows.map((u) => {
            const selected = draft[u.user_id] ?? [];
            const changed = [...selected].sort().join(",") !== [...u.roles].sort().join(",");
            return (
              <div key={u.user_id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto_auto] lg:items-center">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-hof">{u.email}</p>
                  <p className="mt-0.5 text-xs text-foggy">
                    Joined {fmtDay(u.created_at)}
                    {u.employee_id && (
                      <>
                        {" · "}
                        <Link href={`/hr/employees/${u.employee_id}`} className="font-medium text-rausch-dark hover:underline">
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
                        className="h-4 w-4 rounded border-line accent-rausch"
                      />
                      {r}
                    </label>
                  ))}
                </div>
                <StatusPill status={u.is_active ? "ACTIVE" : "DEACTIVATED"} />
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
