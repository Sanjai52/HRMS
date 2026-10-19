"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/app-shell";
import { Button, Card, Field, SkeletonRows, TextInput } from "../../../../components/ui";
import { authedMeta } from "../../../../lib/hr";

interface Counts {
  present: number;
  late: number;
  absent: number;
  halfDay: number;
}

interface DayRow extends Counts {
  workday: string;
}

interface DeptRow extends Counts {
  department: string;
  total: number;
}

interface Report {
  from: string;
  to: string;
  department: string | null;
  totals: Counts;
  days: DayRow[];
  departments: DeptRow[];
}

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const now = new Date();
const monthStart = isoLocal(new Date(now.getFullYear(), now.getMonth(), 1));
const monthEnd = isoLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0));

export default function AttendanceReportsPage() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(monthEnd);
  const [department, setDepartment] = useState("");
  const [depts, setDepts] = useState<string[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [partial, setPartial] = useState<string[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  async function load(nextFrom = from, nextTo = to, nextDept = department) {
    setState("loading");
    try {
      const qs = new URLSearchParams({ from: nextFrom, to: nextTo });
      if (nextDept) qs.set("department", nextDept);
      const body = await authedMeta<Report>(`/api/v1/attendance/reports?${qs.toString()}`);
      setReport(body.data);
      setPartial(body.meta?.partial ? body.meta.unavailable ?? [] : []);
      setDepts((prev) => [...new Set([...prev, ...body.data.departments.map((d) => d.department)])].filter((d) => d !== "").sort((a, b) => a.localeCompare(b)));
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = report?.totals ?? { present: 0, late: 0, absent: 0, halfDay: 0 };
  const activeDays = report?.days.filter((d) => d.present + d.late + d.absent + d.halfDay > 0) ?? [];

  return (
    <AppShell title="Attendance reports">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="mb-5 flex flex-wrap items-end gap-3"
      >
        <Field label="From">
          <TextInput aria-label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <TextInput aria-label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Department">
          <select
            aria-label="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="h-12 rounded-input border border-line bg-white px-4 text-[15px] text-hof outline-none focus:border-hof"
          >
            <option value="">All departments</option>
            {depts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" className="h-12">
          Apply
        </Button>
      </form>

      {partial.length > 0 && (
        <p role="status" className="mb-4 rounded-card border border-arches/40 bg-arches/10 px-4 py-2 text-sm font-medium text-hof">
          Partial results — unavailable: {partial.join(", ")}. Healthy records are complete.
        </p>
      )}

      {state === "loading" && <SkeletonRows n={5} />}
      {state === "error" && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Restricted area</p>
          <p className="mt-1 text-sm text-foggy">HR access required. Sign in with an HR account to view reports.</p>
          <Button variant="quiet" onClick={() => load()} className="mt-4 h-10 px-5 text-sm">
            Try again
          </Button>
        </Card>
      )}
      {state === "ready" && report && (
        <div className="grid max-w-5xl gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["Present", totals.present],
                ["Late", totals.late],
                ["Absent", totals.absent],
                ["Half day", totals.halfDay],
              ] as const
            ).map(([label, value]) => (
              <Card key={label} className="p-5">
                <p className="text-sm font-medium text-foggy">{label}</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-hof">{value}</p>
              </Card>
            ))}
          </div>

          <Card className="overflow-x-auto">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
              <h2 className="text-lg font-semibold text-hof">Daily totals</h2>
              <p className="text-[13px] tabular-nums text-foggy">
                {report.from} → {report.to} · {report.department ?? "All departments"}
              </p>
            </div>
            {activeDays.length === 0 && <p className="px-5 py-4 text-sm text-foggy">No records in this range.</p>}
            {activeDays.length > 0 && (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-line-soft text-left text-xs font-semibold uppercase tracking-wide text-foggy">
                    <th className="px-5 py-2">Day</th>
                    <th className="px-5 py-2 text-right">Present</th>
                    <th className="px-5 py-2 text-right">Late</th>
                    <th className="px-5 py-2 text-right">Absent</th>
                    <th className="px-5 py-2 text-right">Half day</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {activeDays.map((d) => (
                    <tr key={d.workday}>
                      <td className="px-5 py-2.5 font-medium text-hof">{d.workday}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-hof">{d.present}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-hof">{d.late}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-hof">{d.absent}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-hof">{d.halfDay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card className="overflow-x-auto">
            <h2 className="px-5 pt-5 text-lg font-semibold text-hof">By department</h2>
            {report.departments.length === 0 && <p className="px-5 py-4 text-sm text-foggy">No records in this range.</p>}
            {report.departments.length > 0 && (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-line-soft text-left text-xs font-semibold uppercase tracking-wide text-foggy">
                    <th className="px-5 py-2">Department</th>
                    <th className="px-5 py-2 text-right">Present</th>
                    <th className="px-5 py-2 text-right">Late</th>
                    <th className="px-5 py-2 text-right">Absent</th>
                    <th className="px-5 py-2 text-right">Half day</th>
                    <th className="px-5 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {report.departments.map((d) => (
                    <tr key={d.department || "__unassigned"}>
                      <td className="px-5 py-2.5 font-medium text-hof">{d.department || "Unassigned"}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-hof">{d.present}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-hof">{d.late}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-hof">{d.absent}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-hof">{d.halfDay}</td>
                      <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-hof">{d.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
