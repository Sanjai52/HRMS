"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { Card, SkeletonRows } from "../../../components/ui";
import { authed, fmtTime } from "../../../lib/hr";

interface Row {
  employee_id: string;
  name: string;
  department: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
}

export default function HrAttendancePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<Row[]>([]);
  const [partial, setPartial] = useState<string[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  async function load(d: string) {
    setState("loading");
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
      const token = sessionStorage.getItem("hrms_token");
      const res = await fetch(`${base}/api/v1/attendance/day?date=${d}`, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Load failed");
      const body = (await res.json()) as { data: Row[]; meta: { partial: boolean; unavailable?: string[] } };
      setRows(body.data);
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

  return (
    <AppShell title="Attendance management">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(date);
        }}
        className="mb-4 flex max-w-md gap-2"
      >
        <input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-input border border-line bg-white px-3 text-sm text-hof outline-none focus:border-hof" />
        <button type="submit" className="h-11 shrink-0 rounded-full bg-hof px-5 text-sm font-semibold text-white transition hover:bg-black active:scale-[0.98]">
          Show
        </button>
      </form>
      {partial.length > 0 && (
        <p role="status" className="mb-3 rounded-card border border-arches/40 bg-arches/10 px-4 py-2 text-sm font-medium text-hof">
          Partial results — unavailable: {partial.join(", ")}. Healthy records are complete.
        </p>
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
            </div>
          ))}
        </Card>
      )}
    </AppShell>
  );
}
