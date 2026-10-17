"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { Button, Card, Field, TextInput, SkeletonRows } from "../../components/ui";
import { authed, fmtDay } from "../../lib/hr";

interface Lookups {
  departments: string[];
  designations: string[];
  policies: Array<{ leave_type: string; annual_allowance: number }>;
  holidays: Array<{ holiday_date: string; name: string }>;
}

export default function SettingsPage() {
  const [data, setData] = useState<Lookups | null>(null);
  const [dept, setDept] = useState("");
  const [desig, setDesig] = useState("");
  const [error, setError] = useState("");
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [prefs, setPrefs] = useState<{ email_enabled: boolean; in_app_enabled: boolean } | null>(null);
  const [prefsNotice, setPrefsNotice] = useState("");
  const [prefsError, setPrefsError] = useState("");

  async function load() {
    try {
      setData(await authed<Lookups>("/api/v1/admin/settings/lookups"));
      setState("ready");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  }

  useEffect(() => {
    load();
    authed<{ email_enabled: boolean; in_app_enabled: boolean }>("/api/v1/notifications/prefs")
      .then(setPrefs)
      .catch(() => setPrefs({ email_enabled: true, in_app_enabled: true }));
  }, []);

  async function savePrefs(e: React.FormEvent) {
    e.preventDefault();
    if (!prefs) return;
    setPrefsNotice("");
    setPrefsError("");
    try {
      await authed("/api/v1/notifications/prefs", undefined, { method: "PUT", body: JSON.stringify(prefs) });
      setPrefsNotice("Notification settings saved.");
    } catch (err) {
      setPrefsError((err as Error).message);
    }
  }

  return (
    <AppShell title="Settings">
      <div className="grid max-w-3xl gap-6">
        {prefs && (
          <Card className="p-6">
            <h2 className="text-lg font-bold text-hof">Notifications</h2>
            <p className="mt-1 text-sm text-foggy">Choose how HRMS reaches you. Changes apply to future notifications.</p>
            <form onSubmit={savePrefs} className="mt-4 grid gap-3">
              <label className="flex items-center justify-between gap-4 rounded-input bg-pearl px-4 py-3 text-sm">
                <span>
                  <span className="block font-semibold text-hof">In-app notifications</span>
                  <span className="block text-foggy">Show announcements and updates in your notification list.</span>
                </span>
                <input
                  type="checkbox"
                  aria-label="In-app notifications"
                  checked={prefs.in_app_enabled}
                  onChange={(e) => setPrefs({ ...prefs, in_app_enabled: e.target.checked })}
                  className="h-5 w-5 shrink-0 rounded border-line accent-rausch"
                />
              </label>
              <label className="flex items-center justify-between gap-4 rounded-input bg-pearl px-4 py-3 text-sm">
                <span>
                  <span className="block font-semibold text-hof">Email notifications</span>
                  <span className="block text-foggy">Also send these updates to your work e-mail address.</span>
                </span>
                <input
                  type="checkbox"
                  aria-label="Email notifications"
                  checked={prefs.email_enabled}
                  onChange={(e) => setPrefs({ ...prefs, email_enabled: e.target.checked })}
                  className="h-5 w-5 shrink-0 rounded border-line accent-rausch"
                />
              </label>
              {prefsNotice && <p role="status" className="text-sm font-medium text-babu">{prefsNotice}</p>}
              {prefsError && <p role="alert" className="text-sm font-medium text-rausch-dark">{prefsError}</p>}
              <div>
                <Button type="submit" className="h-10 px-5 text-sm">Save notifications</Button>
              </div>
            </form>
          </Card>
        )}
        {state === "loading" && <SkeletonRows n={4} />}
        {state === "error" && (
          <Card className="p-8 text-center">
            <p className="font-semibold text-hof">Restricted area</p>
            <p className="mt-1 text-sm text-foggy">{error}</p>
          </Card>
        )}
        {state === "ready" && data && (
          <div className="grid gap-6">
          <Card className="p-6">
            <h2 className="text-lg font-bold text-hof">Departments</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.departments.map((d) => (
                <span key={d} className="rounded-full bg-pearl px-3 py-1.5 text-[13px] font-medium text-hof">{d}</span>
              ))}
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await authed("/api/v1/admin/settings/departments", undefined, { method: "POST", body: JSON.stringify({ name: dept }) });
                setDept("");
                await load();
              }}
              className="mt-4 flex gap-2"
            >
              <TextInput aria-label="New department" value={dept} onChange={(e) => setDept(e.target.value)} placeholder="New department" required minLength={2} />
              <Button type="submit" className="shrink-0">Add</Button>
            </form>
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-bold text-hof">Designations</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.designations.map((d) => (
                <span key={d} className="rounded-full bg-pearl px-3 py-1.5 text-[13px] font-medium text-hof">{d}</span>
              ))}
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await authed("/api/v1/admin/settings/designations", undefined, { method: "POST", body: JSON.stringify({ name: desig }) });
                setDesig("");
                await load();
              }}
              className="mt-4 flex gap-2"
            >
              <TextInput aria-label="New designation" value={desig} onChange={(e) => setDesig(e.target.value)} placeholder="New designation" required minLength={2} />
              <Button type="submit" className="shrink-0">Add</Button>
            </form>
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-bold text-hof">Leave policies</h2>
            <ul className="mt-3 grid gap-2 text-sm">
              {data.policies.map((p) => (
                <li key={p.leave_type} className="flex justify-between rounded-input bg-pearl px-4 py-2.5">
                  <span className="font-semibold capitalize text-hof">{p.leave_type.toLowerCase()}</span>
                  <span className="text-foggy">{p.annual_allowance} days / year</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-bold text-hof">Holidays 2026</h2>
            <ul className="mt-3 grid gap-2 text-sm">
              {data.holidays.map((h) => (
                <li key={h.holiday_date} className="flex justify-between rounded-input bg-pearl px-4 py-2.5">
                  <span className="font-semibold text-hof">{h.name}</span>
                  <span className="text-foggy">{fmtDay(h.holiday_date)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        )}
      </div>
    </AppShell>
  );
}
