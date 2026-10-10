"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../components/app-shell";
import { Button, Card, SkeletonRows } from "../../components/ui";
import { authed, fmtTime } from "../../lib/hr";

interface Day {
  workday: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
}

export default function AttendancePage() {
  const [today, setToday] = useState<Day | null>(null);
  const [history, setHistory] = useState<Day[]>([]);
  const [summary, setSummary] = useState({ present: 0, late: 0 });
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await authed<{ today: Day | null; history: Day[]; summary: { present: number; late: number } }>("/api/v1/attendance/me");
      setToday(data.today);
      setHistory(data.history);
      setSummary(data.summary);
      setState("ready");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function act(path: string) {
    setBusy(true);
    setError("");
    try {
      await authed(path, undefined, { method: "POST" });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const checkedIn = !!today?.check_in;
  const checkedOut = !!today?.check_out;

  return (
    <AppShell title="Attendance">
      {state === "loading" && <SkeletonRows n={3} />}
      {state === "error" && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Could not load attendance</p>
          <p className="mt-1 text-sm text-foggy">{error}</p>
          <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-hof underline underline-offset-4">
            Go to login
          </Link>
        </Card>
      )}
      {state === "ready" && (
        <div className="grid max-w-3xl gap-6">
          <Card className="flex flex-wrap items-center gap-4 p-6">
            <div className="flex-1">
              <p className="text-sm font-medium text-foggy">Today</p>
              <p className="mt-1 text-xl font-extrabold text-hof">
                {!checkedIn && "Not checked in"}
                {checkedIn && !checkedOut && `Checked in at ${fmtTime(today?.check_in)}`}
                {checkedOut && `Done · ${fmtTime(today?.check_in)} – ${fmtTime(today?.check_out)}`}
              </p>
              <p className="mt-1 text-sm text-foggy">
                {summary.present} present · {summary.late} late this month
              </p>
            </div>
            {!checkedOut && (
              <Button onClick={() => act(checkedIn ? "/api/v1/attendance/check-out" : "/api/v1/attendance/check-in")} disabled={busy} className="disabled:opacity-60">
                {busy ? "Saving…" : checkedIn ? "Check out" : "Check in"}
              </Button>
            )}
          </Card>
          {error && (
            <p role="alert" className="text-sm font-medium text-rausch-dark">
              {error}
            </p>
          )}
          <Card className="divide-y divide-line-soft">
            <h2 className="px-5 pt-5 text-lg font-bold text-hof">This month</h2>
            {history.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No records yet.</p>}
            {history.map((d) => (
              <div key={d.workday} className="flex items-center gap-4 px-5 py-3">
                <span className="w-28 shrink-0 text-sm font-semibold text-hof">{d.workday}</span>
                <span className="flex-1 text-sm text-foggy">
                  {fmtTime(d.check_in)} – {fmtTime(d.check_out)}
                </span>
                <span className="rounded-full bg-pearl px-2.5 py-1 text-xs font-semibold text-hof">{d.status}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
