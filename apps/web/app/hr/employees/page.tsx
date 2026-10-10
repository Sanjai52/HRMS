"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "../../../components/app-shell";
import { Card, SkeletonRows, StatusPill, TextInput } from "../../../components/ui";

interface Row {
  employee_id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  status: string;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Directory() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  async function load(query: string) {
    const token = sessionStorage.getItem("hrms_token");
    if (!token) {
      setState("error");
      return;
    }
    setState("loading");
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
    const res = await fetch(`${base}/api/v1/employees?q=${encodeURIComponent(query)}&limit=30`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setState("error");
      return;
    }
    const body = await res.json();
    setRows(body.data);
    setState("ready");
  }

  useEffect(() => {
    load(params.get("q") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Employee directory">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(q);
        }}
        className="flex max-w-lg gap-2"
      >
        <TextInput aria-label="Search employees" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" />
        <button
          type="submit"
          className="h-12 shrink-0 rounded-full bg-hof px-6 text-[15px] font-semibold text-white transition hover:bg-black active:scale-[0.98]"
        >
          Search
        </button>
      </form>

      <div className="mt-5">
        {state === "loading" && <SkeletonRows n={6} />}
        {state === "error" && (
          <Card className="p-8 text-center">
            <p className="font-semibold text-hof">Sign in to browse the directory</p>
            <Link
              href="/login"
              className="mt-4 inline-flex h-11 items-center rounded-full bg-rausch px-6 text-sm font-semibold text-white hover:bg-rausch-dark"
            >
              Go to login
            </Link>
          </Card>
        )}
        {state === "ready" && (
          <Card className="divide-y divide-line-soft">
            {rows.length === 0 && <p className="px-5 py-8 text-center text-sm text-foggy">No people match that search.</p>}
            {rows.map((r) => (
              <div key={r.employee_id} className="flex items-center gap-4 px-5 py-4 transition hover:bg-pearl/60">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rausch/10 text-sm font-extrabold text-rausch-dark">
                  {initials(r.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-hof">{r.name}</p>
                  <p className="truncate text-sm text-foggy">
                    {r.designation} · {r.department} · {r.email}
                  </p>
                </div>
                <StatusPill status={r.status} />
              </div>
            ))}
          </Card>
        )}
      </div>
    </AppShell>
  );
}

export default function EmployeeDirectoryPage() {
  return (
    <Suspense>
      <Directory />
    </Suspense>
  );
}
