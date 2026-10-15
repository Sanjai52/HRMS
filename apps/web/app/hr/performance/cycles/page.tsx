"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/app-shell";
import { Button, Card, Field, TextInput, SkeletonRows, StatusPill } from "../../../../components/ui";
import { authed, fmtDay } from "../../../../lib/hr";

interface Cycle {
  cycle_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
}

export default function CyclesPage() {
  const [rows, setRows] = useState<Cycle[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      setRows(await authed<Cycle[]>("/api/v1/performance/cycles"));
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <AppShell title="Review cycles">
      <div className="grid max-w-3xl gap-6">
        <Card className="p-6">
          <h2 className="text-balance text-lg font-semibold text-hof">New cycle</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                await authed("/api/v1/performance/cycles", undefined, { method: "POST", body: JSON.stringify({ name, start, end }) });
                setName("");
                await load();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
            className="mt-3 grid gap-3 sm:grid-cols-3"
          >
            <Field label="Name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} required minLength={3} placeholder="H2 Review" />
            </Field>
            <Field label="Starts">
              <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
            </Field>
            <Field label="Ends">
              <TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </Field>
            <div className="sm:col-span-3">
              <Button type="submit" className="w-full">Open cycle</Button>
            </div>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-rausch-dark">
              {error}
            </p>
          )}
        </Card>
        {state === "loading" && <SkeletonRows n={3} />}
        {state === "error" && (
          <Card className="p-8 text-center">
            <p className="text-balance text-[15px] font-semibold text-hof">Could not load cycles</p>
            <p className="mt-1 text-sm text-foggy">Check your connection and try again.</p>
            <Button variant="outline" className="mt-4 h-10 px-5 text-sm" onClick={load}>
              Try again
            </Button>
          </Card>
        )}
        {state === "ready" && (
          <Card className="divide-y divide-line-soft">
            {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No cycles yet. Open the first one above to get started.</p>}
            {rows.map((c) => (
              <div key={c.cycle_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-hof">{c.name}</p>
                  <p className="text-sm tabular-nums text-foggy">{fmtDay(c.start_date)} → {fmtDay(c.end_date)}</p>
                </div>
                <StatusPill status={c.status} />
                {c.status === "ACTIVE" && (
                  <button
                    onClick={async () => {
                      await authed(`/api/v1/performance/cycles/${c.cycle_id}/close`, undefined, { method: "POST" });
                      await load();
                    }}
                    className="rounded-full px-2 py-1 text-sm font-semibold text-foggy outline-none transition duration-200 hover:text-hof focus-visible:ring-2 focus-visible:ring-hof/40 active:scale-[0.98]"
                  >
                    Close
                  </button>
                )}
              </div>
            ))}
          </Card>
        )}
      </div>
    </AppShell>
  );
}
