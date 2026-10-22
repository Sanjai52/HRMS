"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/app-shell";
import { Alert } from "../../../../components/feedback";
import { Button, Card, Field, TextInput, StatusPill } from "../../../../components/ui";
import { api } from "../../../../lib/api";
import { toUserMessage, type UserError } from "../../../../lib/errors";

interface Invitation {
  invitation_id: string;
  email: string;
  name: string;
  role: string;
  status: string;
}

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "Employee",
  MANAGER: "Manager",
  HR: "HR",
  ADMIN: "Admin",
};

type CopyState = "idle" | "copied" | "failed";

export default function NewEmployeePage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [error, setError] = useState<UserError | null>(null);
  const [busy, setBusy] = useState(false);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [listError, setListError] = useState<UserError | null>(null);
  const [notice, setNotice] = useState("");
  // The invitation link stays in state for the clipboard action only; it is
  // never rendered as text.
  const [inviteLink, setInviteLink] = useState("");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [onboardingId, setOnboardingId] = useState("");

  function auth(): string {
    return sessionStorage.getItem("hrms_token") ?? "";
  }

  async function load() {
    setListError(null);
    try {
      setInvites(await api<Invitation[]>("/api/v1/auth/invitations", auth()));
    } catch (err) {
      setListError(toUserMessage(err, "We couldn't load open invitations"));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copyInvitationLink() {
    if (!inviteLink) return;
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(inviteLink);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice("");
    setInviteLink("");
    setCopyState("idle");
    setBusy(true);
    try {
      const created = await api<{ invitationId: string; token?: string }>("/api/v1/auth/invitations", auth(), {
        method: "POST",
        body: JSON.stringify({ email, name, role }),
      });
      if (created.token) {
        const origin =
          process.env.NEXT_PUBLIC_PUBLIC_ORIGIN ?? window.location.origin;
        setInviteLink(`${origin.replace(/\/+$/, "")}/register?token=${encodeURIComponent(created.token)}`);
        setNotice(`Invitation created for ${email}. Copy the invitation link to share it with the new joiner.`);
      } else {
        setNotice(`Invitation email sent to ${email}.`);
      }
      setEmail("");
      setName("");
      await load();
    } catch (err) {
      setError(toUserMessage(err, "We couldn't send this invitation"));
    } finally {
      setBusy(false);
    }
  }

  async function onboard(invitationId: string) {
    setError(null);
    setNotice("");
    setOnboardingId(invitationId);
    try {
      await api("/api/v1/employees/onboard", auth(), {
        method: "POST",
        body: JSON.stringify({ invitationId }),
      });
      setNotice("Employee record created. It appears in the directory once synced.");
      await load();
    } catch (err) {
      setError(toUserMessage(err, "We couldn't create this employee record"));
    } finally {
      setOnboardingId("");
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
            <Alert tone="danger" title={error.title} className="mt-3">
              {error.body}
            </Alert>
          )}
          {notice && (
            <Alert tone="success" className="mt-3">
              {notice}
            </Alert>
          )}
          {inviteLink && (
            <div className="mt-3">
              <Button type="button" variant="outline" onClick={copyInvitationLink} className="h-10 px-5 text-sm">
                Copy invitation link
              </Button>
              {copyState === "copied" && (
                <p role="status" className="mt-2 text-sm font-medium text-success">
                  Invitation link copied.
                </p>
              )}
              {copyState === "failed" && (
                <p role="status" className="mt-2 text-sm text-foggy">
                  We couldn&apos;t copy the link. Check your browser&apos;s clipboard permission and try again.
                </p>
              )}
            </div>
          )}
        </Card>

        <Card className="divide-y divide-line-soft">
          <h2 className="px-5 pt-5 text-lg font-bold text-hof">Open invitations</h2>
          {listError && (
            <div className="px-5 pt-3">
              <Alert
                tone="warning"
                title={listError.title}
                action={{ label: "Try again", onClick: () => void load() }}
              >
                {listError.body}
              </Alert>
            </div>
          )}
          {!listError && invites.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No invitations yet.</p>}
          {invites.map((inv) => (
            <div key={inv.invitation_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-hof">{inv.name?.trim() || inv.email}</p>
                <p className="truncate text-sm text-foggy">
                  {inv.email} · {ROLE_LABELS[inv.role] ?? inv.role}
                </p>
              </div>
              <StatusPill status={inv.status} />
              {inv.status === "RESERVED" && (
                <button
                  onClick={() => onboard(inv.invitation_id)}
                  disabled={onboardingId === inv.invitation_id}
                  className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary-hover active:scale-[0.98] disabled:opacity-60"
                >
                  {onboardingId === inv.invitation_id ? "Creating…" : "Create record"}
                </button>
              )}
            </div>
          ))}
        </Card>
      </div>
    </AppShell>
  );
}
