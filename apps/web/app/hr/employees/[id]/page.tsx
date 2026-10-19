"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../../components/app-shell";
import { Button, Card, Field, TextInput, StatusPill, SkeletonRows } from "../../../../components/ui";
import { api } from "../../../../lib/api";
import { fmtDay, fmtTime } from "../../../../lib/hr";

interface Employee {
  employee_id: string;
  display_id: string;
  email: string;
  name: string;
  department: string;
  designation: string;
  status: string;
  version: number;
}

interface AttendanceRow {
  workday: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
}

interface LeaveRow {
  request_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  workdays: number;
  status: string;
}

interface PayrollRow {
  record_id: string;
  period: string;
  gross_paise: number;
  lop_paise: number;
  net_paise: number;
  scheduled_days: number;
  paid_days: number;
}

interface Activity {
  attendance: AttendanceRow[];
  leave: LeaveRow[];
  payroll: PayrollRow[];
}

type Tab = "overview" | "attendance" | "leave" | "payroll";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "attendance", label: "Attendance" },
  { id: "leave", label: "Leave" },
  { id: "payroll", label: "Payroll" },
];

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function EmployeeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [emp, setEmp] = useState<Employee | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", department: "", designation: "" });
  const [salary, setSalary] = useState({ basic: "", allowances: "", other: "", pf: "", tax: "" });
  const [salaryMsg, setSalaryMsg] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [activity, setActivity] = useState<Activity | null>(null);
  const [activityError, setActivityError] = useState("");

  function auth(): string {
    return sessionStorage.getItem("hrms_token") ?? "";
  }

  async function load() {
    try {
      const data = await api<Employee>(`/api/v1/employees/${id}`, auth());
      setEmp(data);
      setForm({ name: data.name, department: data.department, designation: data.designation });
      try {
        const s = await api<{ basic_paise: number; allowances_paise: number; other_deductions_paise: number; pf_pct: string; tax_pct: string } | null>(`/api/v1/payroll/structures/${id}`, auth());
        if (s) setSalary({ basic: String(s.basic_paise / 100), allowances: String(s.allowances_paise / 100), other: String(s.other_deductions_paise / 100), pf: String(s.pf_pct), tax: String(s.tax_pct) });
      } catch {
        // no structure yet
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (tab === "overview" || activity) return;
    let cancelled = false;
    api<Activity>(`/api/v1/employees/${id}/activity`, auth())
      .then((a) => {
        if (!cancelled) setActivity(a);
      })
      .catch((err) => {
        if (!cancelled) setActivityError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activity, id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!emp) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const data = await api<Employee>(`/api/v1/employees/${id}`, auth(), {
        method: "PATCH",
        body: JSON.stringify({ ...form, version: emp.version }),
      });
      setEmp(data);
      setNotice("Changes saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    if (!window.confirm(`Deactivate ${emp?.name}? They will lose access immediately.`)) return;
    setError("");
    try {
      await api(`/api/v1/employees/${id}/deactivate`, auth(), { method: "POST" });
      router.push("/hr/employees");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AppShell title={emp ? emp.name : "Employee"}>
      {!emp && !error && <SkeletonRows n={3} />}
      {error && !emp && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Could not open this record</p>
          <p className="mt-1 text-sm text-foggy">{error}</p>
          <Link href="/hr/employees" className="mt-4 inline-block text-sm font-semibold text-hof underline underline-offset-4">
            Back to directory
          </Link>
        </Card>
      )}
      {emp && (
        <div className="grid max-w-3xl gap-6">
          <Card className="flex flex-wrap items-center gap-4 p-6">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-rausch/10 text-lg font-extrabold text-rausch-dark">
              {emp.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-extrabold text-hof">{emp.name}</p>
              <p className="truncate text-sm text-foggy">
                {emp.designation} · {emp.department} · {emp.email}
              </p>
            </div>
            <StatusPill status={emp.status} />
          </Card>

          <div role="tablist" aria-label="Employee record" className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={
                  tab === t.id
                    ? "inline-flex h-10 items-center rounded-full bg-hof px-5 text-sm font-semibold text-white"
                    : "inline-flex h-10 items-center rounded-full border border-line bg-white px-5 text-sm font-semibold text-hof transition hover:bg-pearl"
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <>
              <Card className="p-6">
                <h2 className="text-lg font-bold text-hof">Edit record</h2>
                <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Full name">
                    <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </Field>
                  <Field label="Department">
                    <TextInput value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                  </Field>
                  <Field label="Designation">
                    <TextInput value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
                  </Field>
                  <div className="flex items-end">
                    <Button type="submit" disabled={busy} className="w-full disabled:opacity-60">
                      {busy ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                </form>
                {notice && <p className="mt-3 text-sm font-medium text-babu">{notice}</p>}
                {error && (
                  <p role="alert" className="mt-3 text-sm font-medium text-rausch-dark">
                    {error}
                  </p>
                )}
              </Card>
              <Card className="p-6">
                <h2 className="text-lg font-bold text-hof">Salary structure</h2>
                <p className="mt-1 text-sm text-foggy">Monthly amounts in rupees. Used to calculate payroll.</p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setSalaryMsg("");
                    try {
                      await api(`/api/v1/payroll/structures`, auth(), {
                        method: "POST",
                        body: JSON.stringify({
                          employeeId: id,
                          basicPaise: Math.round(Number(salary.basic || 0) * 100),
                          allowancesPaise: Math.round(Number(salary.allowances || 0) * 100),
                          otherDeductionsPaise: Math.round(Number(salary.other || 0) * 100),
                          pfPct: Number(salary.pf || 0),
                          taxPct: Number(salary.tax || 0),
                        }),
                      });
                      setSalaryMsg("Salary saved.");
                    } catch (err) {
                      setSalaryMsg((err as Error).message);
                    }
                  }}
                  className="mt-4 grid gap-4 sm:grid-cols-2"
                >
                  <Field label="Basic (₹/month)">
                    <TextInput inputMode="decimal" value={salary.basic} onChange={(e) => setSalary({ ...salary, basic: e.target.value })} required />
                  </Field>
                  <Field label="Allowances (₹/month)">
                    <TextInput inputMode="decimal" value={salary.allowances} onChange={(e) => setSalary({ ...salary, allowances: e.target.value })} />
                  </Field>
                  <Field label="Other deductions (₹/month)">
                    <TextInput inputMode="decimal" value={salary.other} onChange={(e) => setSalary({ ...salary, other: e.target.value })} />
                  </Field>
                  <Field label="PF % (demonstration)">
                    <TextInput inputMode="decimal" value={salary.pf} onChange={(e) => setSalary({ ...salary, pf: e.target.value })} />
                  </Field>
                  <Field label="Tax % (demonstration)">
                    <TextInput inputMode="decimal" value={salary.tax} onChange={(e) => setSalary({ ...salary, tax: e.target.value })} />
                  </Field>
                  <div className="flex items-end">
                    <Button type="submit" className="w-full">Save salary</Button>
                  </div>
                </form>
                {salaryMsg && <p className="mt-3 text-sm font-medium text-hof">{salaryMsg}</p>}
              </Card>
              <Card className="p-6">
                <h2 className="text-lg font-bold text-hof">Access</h2>
                <p className="mt-1 text-sm text-foggy">Deactivation removes directory access immediately.</p>
                <button
                  onClick={deactivate}
                  className="mt-3 inline-flex h-11 items-center rounded-full border border-rausch px-6 text-sm font-semibold text-rausch-dark transition hover:bg-rausch/10 active:scale-[0.98]"
                >
                  Deactivate employee
                </button>
              </Card>
            </>
          )}

          {tab !== "overview" && (
            <Card className="p-6">
              {!activity && !activityError && <SkeletonRows n={3} />}
              {activityError && (
                <>
                  <p className="font-semibold text-hof">Could not load the activity feed</p>
                  <p className="mt-1 text-sm text-foggy">{activityError}</p>
                </>
              )}
              {activity && tab === "attendance" && (
                <>
                  <h2 className="text-lg font-bold text-hof">Attendance</h2>
                  {activity.attendance.length === 0 && <p className="mt-3 text-sm text-foggy">No attendance recorded yet.</p>}
                  {activity.attendance.length > 0 && (
                    <div className="mt-3 divide-y divide-line-soft">
                      {activity.attendance.map((a) => (
                        <div key={a.workday} className="flex items-center gap-3 py-2.5">
                          <p className="min-w-0 flex-1 text-sm font-semibold text-hof">{fmtDay(a.workday)}</p>
                          <p className="text-sm text-foggy">
                            {fmtTime(a.check_in)} – {fmtTime(a.check_out)}
                          </p>
                          <StatusPill status={a.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {activity && tab === "leave" && (
                <>
                  <h2 className="text-lg font-bold text-hof">Leave requests</h2>
                  {activity.leave.length === 0 && <p className="mt-3 text-sm text-foggy">No leave requests yet.</p>}
                  {activity.leave.length > 0 && (
                    <div className="mt-3 divide-y divide-line-soft">
                      {activity.leave.map((l) => (
                        <div key={l.request_id} className="flex flex-wrap items-center gap-3 py-2.5">
                          <p className="min-w-0 flex-1 text-sm font-semibold capitalize text-hof">{l.leave_type.toLowerCase()}</p>
                          <p className="text-sm text-foggy">
                            {fmtDay(l.start_date)} – {fmtDay(l.end_date)} · {l.workdays}d
                          </p>
                          <StatusPill status={l.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {activity && tab === "payroll" && (
                <>
                  <h2 className="text-lg font-bold text-hof">Payroll records</h2>
                  {activity.payroll.length === 0 && <p className="mt-3 text-sm text-foggy">No payslips yet.</p>}
                  {activity.payroll.length > 0 && (
                    <div className="mt-3 divide-y divide-line-soft">
                      {activity.payroll.map((p) => (
                        <div key={p.record_id} className="flex flex-wrap items-center gap-3 py-2.5">
                          <p className="min-w-0 flex-1 text-sm font-semibold text-hof">{p.period}</p>
                          <p className="text-sm text-foggy">
                            Gross {rupees(p.gross_paise)} · LOP {rupees(p.lop_paise)} · {p.paid_days}/{p.scheduled_days}d
                          </p>
                          <p className="text-sm font-bold text-hof">{rupees(p.net_paise)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </Card>
          )}
        </div>
      )}
    </AppShell>
  );
}
