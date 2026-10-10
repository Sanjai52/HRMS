"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/app-shell";
import { Button, Card, Field, TextInput, StatusPill } from "../../../../components/ui";
import { api } from "../../../../lib/api";

interface Invitation {
  invitation_id: string;
  email: string;
  name: string;
  role: string;
  status: string;
}

export default function NewEmployeePage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [notice, setNotice] = useState("");

  function auth(): string {
    return sessionStorage.getItem("hrms_token") ?? "";
  }

  async function load() {
    try {
      setInvites(await api<Invitation[]>("/api/v1/auth/invitations", auth()));
    } catch {
      // leave list empty; form still usable
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api<{ invitationId: string; token: string }>("/api/v1/auth/invitations", auth(), {
        method: "POST",
        body: JSON.stringify({ email, name, role }),
      });
      setEmail("");
      setName("");
      setNotice("Invitation created. Share the accept link with the new joiner.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onboard(invitationId: string) {
    setError("");
    setNotice("");
    try {
      const out = await api<{ employeeId: string }>("/api/v1/employees/onboard", auth(), {
        method: "POST",
        body: JSON.stringify({ invitationId }),
      });
      setNotice("Employee record created. It appears in the directory once synced.");
      await load();
      void out;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AppShell title="Add employee">
      <div className="grid max-w-3xl gap-6">
        <Card className="p-6">
          <h2 className="text-lg font-bold text-hof">Invite a new joiner</h2>
          <p className="mt-1 text-sm text-foggy">They accept the invitation and set a password, then you create their record.</p>
          <form onSubmit={invite} className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Email address">
              <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Role">
              <select
                aria-label="Role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-12 rounded-input border border-line bg-white px-3 text-[15px] text-hof outline-none focus:border-hof"
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="MANAGER">Manager</option>
                <option value="HR">HR</option>
                <option value="ADMIN">Admin</option>
              </select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={busy} className="w-full disabled:opacity-60">
                {busy ? "Inviting…" : "Send invitation"}
              </Button>
            </div>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-rausch-dark">
              {error}
            </p>
          )}
          {notice && <p className="mt-3 text-sm font-medium text-babu">{notice}</p>}
        </Card>

        <Card className="divide-y divide-line-soft">
          <h2 className="px-5 pt-5 text-lg font-bold text-hof">Open invitations</h2>
          {invites.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No invitations yet.</p>}
          {invites.map((inv) => (
            <div key={inv.invitation_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-hof">{inv.name || inv.email}</p>
                <p className="truncate text-sm text-foggy">
                  {inv.email} · {inv.role}
                </p>
                <p className="mt-1 text-[13px] text-foggy">
                  Accept link: <span className="font-mono">/register?token=…</span> (token shown once at creation)
                </p>
              </div>
              <StatusPill status={inv.status} />
              {inv.status === "RESERVED" && (
                <button
                  onClick={() => onboard(inv.invitation_id)}
                  className="h-10 rounded-full bg-rausch px-5 text-sm font-semibold text-white transition hover:bg-rausch-dark active:scale-[0.98]"
                >
                  Create record
                </button>
              )}
            </div>
          ))}
        </Card>
      </div>
    </AppShell>
  );
}
