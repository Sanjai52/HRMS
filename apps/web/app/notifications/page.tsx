"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { Alert, ErrorState } from "../../components/feedback";
import { Button, Card, Field, SkeletonRows, TextInput } from "../../components/ui";
import { toUserMessage, type UserError } from "../../lib/errors";
import { fmtDateTime } from "../../lib/format";
import { authed } from "../../lib/hr";
import { rolesOf } from "../../lib/api";

interface Notif {
  notification_id: string;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const TITLE_NUMERIC_ID_PATTERN = /\b\d{8,}\b/;
const BODY_NUMERIC_ID_PATTERN = /\b\d{15,}\b/;
const STATUS_TOKEN_PATTERN = /\b(?:APPROVED|REJECTED|CANCELLED|PENDING(?:_[A-Z]+)?)\b/;
const REQUEST_ID_PATTERN = /\bRequest\s+\d+\b/i;

/** Hide machine-shaped notification titles while keeping human titles intact. */
function safeNotificationTitle(n: Notif): string {
  const title = n.title ?? "";
  const normalized = title.trim().toLowerCase();

  if (normalized === "leave pending_manager") return "Leave awaiting manager";
  if (normalized === "leave pending_hr") return "Leave awaiting HR";

  const unsafe =
    UUID_PATTERN.test(title) ||
    TITLE_NUMERIC_ID_PATTERN.test(title) ||
    STATUS_TOKEN_PATTERN.test(title);

  return unsafe ? "Leave request updated" : title;
}

/** Backend notification bodies can contain IDs or status codes; keep them out of the DOM. */
function safeNotificationBody(n: Notif): string {
  const body = n.body ?? "";
  const unsafe =
    UUID_PATTERN.test(body) ||
    BODY_NUMERIC_ID_PATTERN.test(body) ||
    STATUS_TOKEN_PATTERN.test(body) ||
    REQUEST_ID_PATTERN.test(body);

  if (!unsafe) return body;

  const title = (n.title ?? "").toLowerCase();
  const kind = (n.kind ?? "").toLowerCase();

  if (kind === "leave" || title.includes("leave")) {
    if (title.includes("approved")) return "Your leave request was approved.";
    if (title.includes("rejected")) return "Your leave request was rejected.";
    if (title.includes("cancelled") || title.includes("canceled")) return "Your leave request was cancelled.";
  }
  if (kind === "payroll" || title.includes("payslip")) return "Your payslip is ready under Payroll.";

  return "There is an update on your request. Open the related section for details.";
}

export default function NotificationsPage() {
  const [rows, setRows] = useState<Notif[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<UserError | null>(null);
  const [canAnnounce, setCanAnnounce] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [announceError, setAnnounceError] = useState<UserError | null>(null);
  const [markReadError, setMarkReadError] = useState<UserError | null>(null);

  async function load() {
    setState("loading");
    setError(null);
    setMarkReadError(null);
    try {
      setRows(await authed<Notif[]>("/api/v1/notifications"));
      setState("ready");
    } catch (err) {
      setError(toUserMessage(err, "We couldn't load notifications"));
      setState("error");
    }
  }

  useEffect(() => {
    load();
    setCanAnnounce(rolesOf(sessionStorage.getItem("hrms_token")).some((r) => r === "HR" || r === "ADMIN"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setNotice("");
    setAnnounceError(null);
    try {
      await authed("/api/v1/notifications/announcements", undefined, { method: "POST", body: JSON.stringify({ title, body }) });
      setTitle("");
      setBody("");
      setNotice("Announcement sent to every active employee.");
    } catch (err) {
      setAnnounceError(toUserMessage(err, "We couldn't send the announcement"));
    } finally {
      setSending(false);
    }
  }

  async function markRead(id: string) {
    setMarkReadError(null);
    try {
      await authed(`/api/v1/notifications/${id}/read`, undefined, { method: "POST" });
      setRows((prev) => prev.map((n) => (n.notification_id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    } catch (err) {
      setMarkReadError(toUserMessage(err, "We couldn't update this notification"));
    }
  }

  return (
    <AppShell title="Notifications">
      {announceError && (
        <Alert tone="danger" title={announceError.title} className="mb-6 max-w-3xl">
          {announceError.body}
        </Alert>
      )}
      {canAnnounce && (
        <Card className="mb-6 max-w-3xl p-6">
          <h2 className="text-lg font-bold text-hof">New announcement</h2>
          <p className="mt-1 text-sm text-foggy">Sends an in-app notification and an e-mail to every active employee, respecting their notification settings.</p>
          {notice && (
            <div className="mt-3">
              <Alert tone="success">{notice}</Alert>
            </div>
          )}
          <form onSubmit={sendAnnouncement} className="mt-4 grid gap-3">
            <Field label="Title">
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
        <>
          {markReadError && (
            <Alert tone="danger" title={markReadError.title} className="mb-4 max-w-3xl">
              {markReadError.body}
            </Alert>
          )}
          <Card className="max-w-3xl divide-y divide-line-soft">
            {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">All caught up.</p>}
            {rows.map((n) => (
              <button key={n.notification_id} onClick={() => markRead(n.notification_id)} className="flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-pearl/60">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-line" : "bg-primary"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-hof">{safeNotificationTitle(n)}</span>
                  <span className="block truncate text-sm text-foggy">{safeNotificationBody(n)}</span>
                  <span className="mt-0.5 block text-xs text-foggy">{fmtDateTime(n.created_at)}</span>
                </span>
              </button>
            ))}
          </Card>
        </>
      )}
    </AppShell>
  );
}
