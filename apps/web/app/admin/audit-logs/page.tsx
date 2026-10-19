"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { Button, Card, SkeletonRows, TextInput } from "../../../components/ui";
import { authed, fmtTime } from "../../../lib/hr";

interface Row {
  event_id: string;
  actor: string;
  action: string;
  resource: string;
  timestamp: string;
}

export default function AuditLogsPage() {
  const [action, setAction] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  async function load(a: string) {
    setState("loading");
    try {
      setRows(await authed<Row[]>(`/api/v1/admin/audit-logs${a ? `?action=${encodeURIComponent(a)}` : ""}&limit=50`));
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Audit log">
      <form onSubmit={(e) => { e.preventDefault(); load(action); }} className="mb-4 flex max-w-lg gap-2">
        <TextInput aria-label="Filter by action" value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. leave.decided" />
        <button type="submit" className="h-12 shrink-0 rounded-full bg-hof px-6 text-[15px] font-semibold text-white outline-none transition duration-200 hover:bg-black focus-visible:ring-2 focus-visible:ring-hof focus-visible:ring-offset-2 active:scale-[0.98]">
          Filter
        </button>
      </form>
      {state === "loading" && <SkeletonRows n={5} />}
      {state === "error" && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Restricted area</p>
          <p className="mt-1 text-sm text-foggy">Admin access required.</p>
          <Button variant="quiet" onClick={() => load(action)} className="mt-4 h-10 px-5 text-sm">
            Try again
          </Button>
        </Card>
      )}
      {state === "ready" && (
        <Card className="divide-y divide-line-soft">
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No audit events yet.</p>}
          {rows.map((r) => (
            <div key={r.event_id} className="px-5 py-3.5">
              <p className="font-mono text-[13px] font-semibold text-hof">{r.action}</p>
              <p className="truncate text-sm tabular-nums text-foggy">{r.resource} · {fmtTime(r.timestamp)}</p>
            </div>
          ))}
        </Card>
      )}
    </AppShell>
  );
}
