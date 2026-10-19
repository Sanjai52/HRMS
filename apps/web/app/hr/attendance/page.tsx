"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { Button, Card, Field, SkeletonRows, TextInput } from "../../../components/ui";
import { authed, fmtTime } from "../../../lib/hr";

interface Row {
  employee_id: string;
  name: string;
  department: string;
  workday: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
}

const STATUSES = ["PRESENT", "LATE", "ABSENT", "HALF_DAY"] as const;

function toTimeInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function HrAttendancePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [shownDate, setShownDate] = useState(today);
  const [rows, setRows] = useState<Row[]>([]);
  const [partial, setPartial] = useState<string[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState({ status: "PRESENT", checkIn: "", checkOut: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load(d: string) {
    setState("loading");
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
      const token = sessionStorage.getItem("hrms_token");
      const res = await fetch(`${base}/api/v1/attendance/day?date=${d}`, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Load failed");
      const body = (await res.json()) as { data: Row[]; meta: { partial: boolean; unavailable?: string[] } };
      setRows(body.data);
      setShownDate(d);
      setPartial(body.meta.partial ? body.meta.unavailable ?? [] : []);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCorrection(row: Row) {
    setError("");
    setNotice("");
    setForm({ status: row.status, checkIn: toTimeInput(row.check_in), checkOut: toTimeInput(row.check_out), reason: "" });
    setEditing(row);
  }

  async function saveCorrection() {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      await authed("/api/v1/attendance/corrections", undefined, {
        method: "POST",
        body: JSON.stringify({
          employeeId: editing.employee_id,
          workday: shownDate,
          status: form.status,
          reason: form.reason,
          ...(form.checkIn ? { checkIn: form.checkIn } : {}),
          ...(form.checkOut ? { checkOut: form.checkOut } : {}),
        }),
      });
      setNotice(`Correction saved for ${editing.name} on ${shownDate}.`);
      setEditing(null);
      await load(shownDate);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Attendance management">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(date);
          }}
          className="flex max-w-md gap-2"
        >
          <input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-input border border-line bg-white px-3 text-sm text-hof outline-none focus:border-hof" />
          <button type="submit" className="h-11 shrink-0 rounded-full bg-hof px-5 text-sm font-semibold text-white transition hover:bg-black active:scale-[0.98]">
            Show
          </button>
        </form>
        <Link href="/hr/attendance/reports" className="ml-auto text-sm font-semibold text-rausch-dark hover:underline">
          Attendance reports →
        </Link>
      </div>
      {partial.length > 0 && (
        <p role="status" className="mb-3 rounded-card border border-arches/40 bg-arches/10 px-4 py-2 text-sm font-medium text-hof">
          Partial results — unavailable: {partial.join(", ")}. Healthy records are complete.
        </p>
      )}
      {notice && (
        <div role="status" className="mb-3 rounded-card border border-babu/30 bg-babu/10 px-4 py-2 text-sm font-medium text-babu">
          {notice}
        </div>
      )}
      {state === "loading" && <SkeletonRows n={5} />}
      {state === "error" && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Could not load attendance</p>
        </Card>
      )}
      {state === "ready" && (
        <Card className="divide-y divide-line-soft">
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No check-ins on this day.</p>}
          {rows.map((r) => (
            <div key={r.employee_id} className="flex items-center gap-4 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-hof">{r.name}</p>
                <p className="truncate text-sm text-foggy">{r.department}</p>
              </div>
              <span className="text-sm text-foggy">{fmtTime(r.check_in)} – {fmtTime(r.check_out)}</span>
              <span className="rounded-full bg-pearl px-2.5 py-1 text-xs font-semibold text-hof">{r.status}</span>
              <button
                type="button"
                onClick={() => openCorrection(r)}
                className="shrink-0 rounded-full border border-line bg-white px-3.5 py-1.5 text-xs font-semibold text-hof transition hover:border-hof"
              >
                Correct
              </button>
            </div>
          ))}
        </Card>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-hof/30 p-4" role="dialog" aria-modal="true" aria-label="Correct attendance">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-hof">Correct attendance</h2>
            <p className="mt-1 text-sm text-foggy">
              {editing.name} · {shownDate}
              {editing.department ? ` · ${editing.department}` : ""}
            </p>
            <div className="mt-4 grid gap-4">
              <Field label="Status">
                <select
                  aria-label="Status"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="h-12 rounded-input border border-line bg-white px-4 text-[15px] text-hof outline-none focus:border-hof"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Check-in">
                  <TextInput aria-label="Check-in" type="time" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} />
                </Field>
                <Field label="Check-out">
                  <TextInput aria-label="Check-out" type="time" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} />
                </Field>
              </div>
              <Field label="Reason" error={form.reason.length > 0 && form.reason.trim().length < 3 ? "At least 3 characters." : undefined}>
                <TextInput aria-label="Reason" placeholder="Why is this record being corrected?" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </Field>
            </div>
            {error && (
              <div role="alert" className="mt-3 rounded-card border border-rausch/30 bg-rausch/10 px-4 py-2 text-sm font-medium text-rausch-dark">
                {error}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="quiet" onClick={() => setEditing(null)} disabled={saving} className="h-11 px-5 text-sm">
                Cancel
              </Button>
              <Button onClick={saveCorrection} disabled={saving || form.reason.trim().length < 3} className="h-11 px-5 text-sm">
                {saving ? "Saving…" : "Save correction"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
