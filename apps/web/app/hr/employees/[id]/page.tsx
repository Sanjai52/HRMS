"use client";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../../components/app-shell";
import { Alert, ErrorState } from "../../../../components/feedback";
import { Button, Card, Field, TextInput, StatusPill, SkeletonRows } from "../../../../components/ui";
import { api } from "../../../../lib/api";
import { toUserMessage, type UserError } from "../../../../lib/errors";
import { fmtDay, fmtMoney, fmtTime, initials, periodLabel } from "../../../../lib/format";

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

interface SalaryStructure {
  basic_paise: number;
  allowances_paise: number;
  other_deductions_paise: number;
  pf_pct: string;
  tax_pct: string;
}

type Tab = "overview" | "attendance" | "leave" | "payroll";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "attendance", label: "Attendance" },
  { id: "leave", label: "Leave" },
  { id: "payroll", label: "Payroll" },
];

const EMPTY_SALARY = { basic: "", allowances: "", other: "", pf: "", tax: "" };

export default function EmployeeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [emp, setEmp] = useState<Employee | null>(null);
  const [loadError, setLoadError] = useState<UserError | null>(null);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState<UserError | null>(null);
  const [deactivateError, setDeactivateError] = useState<UserError | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", department: "", designation: "" });
  const [salary, setSalary] = useState(EMPTY_SALARY);
  const [salaryNotice, setSalaryNotice] = useState("");
  const [salaryError, setSalaryError] = useState<UserError | null>(null);
  const [salaryLoadError, setSalaryLoadError] = useState<UserError | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [activity, setActivity] = useState<Activity | null>(null);
  const [activityError, setActivityError] = useState<UserError | null>(null);
  const activeIdRef = useRef(id);

  function auth(): string {
    return sessionStorage.getItem("hrms_token") ?? "";
  }

  async function loadSalary(targetId = id, isCurrent = () => activeIdRef.current === targetId) {
    if (!isCurrent()) return;
    setSalaryLoadError(null);
    try {
      const s = await api<SalaryStructure | null>(`/api/v1/payroll/structures/${targetId}`, auth());
      if (!isCurrent()) return;
      if (s) {
        setSalary({
          basic: String(s.basic_paise / 100),
          allowances: String(s.allowances_paise / 100),
          other: String(s.other_deductions_paise / 100),
          pf: String(s.pf_pct),
          tax: String(s.tax_pct),
        });
      } else {
        setSalary(EMPTY_SALARY);
      }
    } catch (err) {
      if (!isCurrent()) return;
      setSalaryLoadError(toUserMessage(err, "We couldn't load the salary structure"));
    }
  }

  async function load(targetId = id, isCurrent = () => activeIdRef.current === targetId) {
    if (!isCurrent()) return;
    setLoadError(null);
    try {
      const data = await api<Employee>(`/api/v1/employees/${targetId}`, auth());
      if (!isCurrent()) return;
      setEmp(data);
      setForm({ name: data.name, department: data.department, designation: data.designation });
      await loadSalary(targetId, isCurrent);
    } catch (err) {
      if (!isCurrent()) return;
      setLoadError(toUserMessage(err, "We couldn't open this employee"));
    }
  }

  useEffect(() => {
    activeIdRef.current = id;
    let cancelled = false;
    const isCurrent = () => !cancelled && activeIdRef.current === id;

    setEmp(null);
    setForm({ name: "", department: "", designation: "" });
    setSalary(EMPTY_SALARY);
    setActivity(null);
    setNotice("");
    setSaveError(null);
    setDeactivateError(null);
    setSalaryNotice("");
    setSalaryError(null);
    setSalaryLoadError(null);
    setActivityError(null);
    setLoadError(null);
    setBusy(false);

    void load(id, isCurrent);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadActivity(targetId = id, isCurrent = () => activeIdRef.current === targetId) {
    if (!isCurrent()) return;
    setActivityError(null);
    try {
      const data = await api<Activity>(`/api/v1/employees/${targetId}/activity`, auth());
      if (!isCurrent()) return;
      setActivity(data);
    } catch (err) {
      if (!isCurrent()) return;
      setActivityError(toUserMessage(err, "We couldn't load this employee's activity"));
    }
  }

  useEffect(() => {
    if (tab === "overview") return;
    let cancelled = false;
    void loadActivity(id, () => !cancelled && activeIdRef.current === id);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!emp || emp.employee_id !== id) return;
    const targetId = id;
    const version = emp.version;
    setSaveError(null);
    setNotice("");
    setBusy(true);
    try {
      const data = await api<Employee>(`/api/v1/employees/${targetId}`, auth(), {
        method: "PATCH",
        body: JSON.stringify({ ...form, version }),
      });
      if (activeIdRef.current !== targetId) return;
      setEmp(data);
      setNotice("Changes saved.");
    } catch (err) {
      if (activeIdRef.current !== targetId) return;
      setSaveError(toUserMessage(err, "We couldn't save these changes"));
    } finally {
      if (activeIdRef.current === targetId) setBusy(false);
    }
  }

  async function deactivate() {
    const target = emp;
    if (!target || target.employee_id !== id) return;
    if (!window.confirm(`Deactivate ${target.name}? They will lose access immediately.`)) return;
    setDeactivateError(null);
    try {
      await api(`/api/v1/employees/${target.employee_id}/deactivate`, auth(), { method: "POST" });
      if (activeIdRef.current === target.employee_id) router.push("/hr/employees");
    } catch (err) {
      if (activeIdRef.current !== target.employee_id) return;
      setDeactivateError(toUserMessage(err, "We couldn't deactivate this employee"));
    }
  }

  async function saveSalary(e: React.FormEvent) {
    e.preventDefault();
    if (!emp || emp.employee_id !== id || salaryLoadError) return;
    const targetId = id;
    setSalaryError(null);
    setSalaryNotice("");
    try {
      await api(`/api/v1/payroll/structures`, auth(), {
        method: "POST",
        body: JSON.stringify({
          employeeId: targetId,
          basicPaise: Math.round(Number(salary.basic || 0) * 100),
          allowancesPaise: Math.round(Number(salary.allowances || 0) * 100),
          otherDeductionsPaise: Math.round(Number(salary.other || 0) * 100),
          pfPct: Number(salary.pf || 0),
          taxPct: Number(salary.tax || 0),
        }),
      });
      if (activeIdRef.current !== targetId) return;
      setSalaryNotice("Salary saved.");
    } catch (err) {
      if (activeIdRef.current !== targetId) return;
      setSalaryError(toUserMessage(err, "We couldn't save the salary structure"));
    }
  }

  return (
    <AppShell title={emp ? emp.name : "Employee"}>
      {!emp && !loadError && <SkeletonRows n={3} />}
      {loadError && !emp && (
        <ErrorState
          title={loadError.title}
          body={loadError.body}
          actionLabel={loadError.action === "back" ? "Back to directory" : loadError.actionLabel}
          actionHref={loadError.action === "signin" ? "/login" : loadError.action === "back" ? "/hr/employees" : undefined}
          onAction={loadError.action === "signin" || loadError.action === "back" ? undefined : () => void load()}
          secondaryLabel={loadError.action === "back" ? undefined : "Back to directory"}
          secondaryHref={loadError.action === "back" ? undefined : "/hr/employees"}
        />
      )}
      {emp && (
        <div className="grid max-w-3xl gap-6">
          <Card className="flex flex-wrap items-center gap-4 p-6">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-lg font-extrabold text-primary-ink">
              {initials(emp.name)}
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
                {notice && (
                  <Alert tone="success" className="mt-3">
                    {notice}
                  </Alert>
                )}
                {saveError && (
                  <Alert tone="danger" title={saveError.title} className="mt-3">
                    {saveError.body}
                  </Alert>
                )}
              </Card>
              <Card className="p-6">
                <h2 className="text-lg font-bold text-hof">Salary structure</h2>
                <p className="mt-1 text-sm text-foggy">Monthly amounts in rupees. Used to calculate payroll.</p>
                {salaryLoadError && (
                  <Alert
                    tone="warning"
                    title={salaryLoadError.title}
                    className="mt-3"
                    action={{ label: "Try again", onClick: () => void loadSalary() }}
                  >
                    The current structure could not be loaded, so saving is paused to avoid replacing it.
                  </Alert>
                )}
                <form onSubmit={saveSalary} className="mt-4 grid gap-4 sm:grid-cols-2">
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
                    <Button type="submit" disabled={Boolean(salaryLoadError)} className="w-full disabled:opacity-60">
                      Save salary
                    </Button>
                  </div>
                </form>
                {salaryNotice && (
                  <Alert tone="success" className="mt-3">
                    {salaryNotice}
                  </Alert>
                )}
                {salaryError && (
                  <Alert tone="danger" title={salaryError.title} className="mt-3">
                    {salaryError.body}
                  </Alert>
                )}
              </Card>
              <Card className="p-6">
                <h2 className="text-lg font-bold text-hof">Access</h2>
                <p className="mt-1 text-sm text-foggy">Deactivation removes directory access immediately.</p>
                <button
                  onClick={deactivate}
                  className="mt-3 inline-flex h-11 items-center rounded-full border border-danger px-6 text-sm font-semibold text-danger transition hover:bg-danger/10 active:scale-[0.98]"
                >
                  Deactivate employee
                </button>
                {deactivateError && (
                  <Alert tone="danger" title={deactivateError.title} className="mt-3">
                    {deactivateError.body}
                  </Alert>
                )}
              </Card>
            </>
          )}

          {tab !== "overview" && (
            <Card className="p-6">
              {!activity && !activityError && <SkeletonRows n={3} />}
              {activityError && (
                <Alert
                  tone="danger"
                  title={activityError.title}
                  action={{ label: "Try again", onClick: () => void loadActivity() }}
                >
                  {activityError.body}
                </Alert>
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
                          <p className="min-w-0 flex-1 text-sm font-semibold text-hof">{periodLabel(p.period)}</p>
                          <p className="text-sm text-foggy">
                            Gross {fmtMoney(p.gross_paise)} · LOP {fmtMoney(p.lop_paise)} · {p.paid_days}/{p.scheduled_days}d
                          </p>
                          <p className="text-sm font-bold text-hof">{fmtMoney(p.net_paise)}</p>
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
