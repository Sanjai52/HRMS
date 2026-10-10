"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../components/app-shell";
import { Card, SkeletonRows } from "../../components/ui";
import { authed, fmtTime } from "../../lib/hr";

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
  }, []);

  async function markRead(id: string) {
    await authed(`/api/v1/notifications/${id}/read`, undefined, { method: "POST" });
    setRows((prev) => prev.map((n) => (n.notification_id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  }

  return (
    <AppShell title="Notifications">
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
