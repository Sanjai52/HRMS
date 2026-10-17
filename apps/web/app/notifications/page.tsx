"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../components/app-shell";
import { Button, Card, Field, SkeletonRows, TextInput } from "../../components/ui";
import { authed, fmtTime } from "../../lib/hr";
import { rolesOf } from "../../lib/api";

interface Notif {
  notification_id: string;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export default function NotificationsPage() {
  const [rows, setRows] = useState<Notif[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [canAnnounce, setCanAnnounce] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");

  async function load() {
    try {
      setRows(await authed<Notif[]>("/api/v1/notifications"));
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    load();
    setCanAnnounce(rolesOf(sessionStorage.getItem("hrms_token")).some((r) => r === "HR" || r === "ADMIN"));
  }, []);

  async function sendAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setNotice("");
    setFormError("");
    try {
      await authed("/api/v1/notifications/announcements", undefined, { method: "POST", body: JSON.stringify({ title, body }) });
      setTitle("");
      setBody("");
      setNotice("Announcement sent to every active employee.");
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function markRead(id: string) {
    await authed(`/api/v1/notifications/${id}/read`, undefined, { method: "POST" });
    setRows((prev) => prev.map((n) => (n.notification_id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  }

  return (
    <AppShell title="Notifications">
      {canAnnounce && (
        <Card className="mb-6 max-w-3xl p-6">
          <h2 className="text-lg font-bold text-hof">New announcement</h2>
          <p className="mt-1 text-sm text-foggy">Sends an in-app notification and an e-mail to every active employee, respecting their notification settings.</p>
          {notice && <p role="status" className="mt-3 rounded-input bg-babu/10 px-4 py-2.5 text-sm font-medium text-babu">{notice}</p>}
          <form onSubmit={sendAnnouncement} className="mt-4 grid gap-3">
            <Field label="Title" error={formError || undefined}>
              <TextInput aria-label="Announcement title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Office closed on Monday" required minLength={3} />
            </Field>
            <label className="grid gap-2 text-sm">
              <span className="font-semibold text-hof">Body</span>
              <textarea
                aria-label="Announcement body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                className="rounded-input border border-line bg-white px-4 py-3 text-[15px] text-hof outline-none transition duration-200 placeholder:text-foggy/70 focus:border-hof focus-visible:ring-2 focus-visible:ring-hof/40"
                placeholder="Details employees should know"
              />
            </label>
            <div>
              <Button type="submit" disabled={sending}>{sending ? "Sending…" : "Send announcement"}</Button>
            </div>
          </form>
        </Card>
      )}
      {state === "loading" && <SkeletonRows n={4} />}
      {state === "error" && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Sign in to see notifications</p>
          <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-hof underline underline-offset-4">
            Go to login
          </Link>
        </Card>
      )}
      {state === "ready" && (
        <Card className="max-w-3xl divide-y divide-line-soft">
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">All caught up.</p>}
          {rows.map((n) => (
            <button key={n.notification_id} onClick={() => markRead(n.notification_id)} className="flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-pearl/60">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-line" : "bg-rausch"}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-hof">{n.title}</span>
                <span className="block truncate text-sm text-foggy">{n.body}</span>
                <span className="mt-0.5 block text-xs text-foggy">{fmtTime(n.created_at)}</span>
              </span>
            </button>
          ))}
        </Card>
      )}
    </AppShell>
  );
}
