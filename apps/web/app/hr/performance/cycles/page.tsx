"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/app-shell";
import { Alert, ErrorState } from "../../../../components/feedback";
import { Button, Card, Field, TextInput, SkeletonRows, StatusPill } from "../../../../components/ui";
import { toUserMessage, type UserError } from "../../../../lib/errors";
import { fmtDay } from "../../../../lib/format";
import { authed } from "../../../../lib/hr";

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
  const [loadError, setLoadError] = useState<UserError | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [createError, setCreateError] = useState<UserError | null>(null);
  const [closeError, setCloseError] = useState<UserError | null>(null);
  const [creating, setCreating] = useState(false);
  const [closingId, setClosingId] = useState("");

  async function load() {
    setState("loading");
    setLoadError(null);
    try {
      setRows(await authed<Cycle[]>("/api/v1/performance/cycles"));
      setState("ready");
    } catch (err) {
      setLoadError(toUserMessage(err, "We couldn't load review cycles"));
      setState("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Review cycles">
      <div className="grid max-w-3xl gap-6">
        <Card className="p-6">
          <h2 className="text-balance text-lg font-semibold text-hof">New cycle</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setCreateError(null);
              setCloseError(null);
              setCreating(true);
              try {
                await authed("/api/v1/performance/cycles", undefined, { method: "POST", body: JSON.stringify({ name, start, end }) });
                setName("");
                await load();
              } catch (err) {
                setCreateError(toUserMessage(err, "We couldn't open this review cycle"));
              } finally {
                setCreating(false);
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
              <Button type="submit" disabled={creating} className="w-full disabled:opacity-60">
                {creating ? "Opening…" : "Open cycle"}
              </Button>
            </div>
          </form>
          {createError && (
            <Alert tone="danger" title={createError.title} className="mt-3">
              {createError.body}
            </Alert>
          )}
        </Card>
        {state === "loading" && <SkeletonRows n={3} />}
        {state === "error" && loadError && (
          <ErrorState
            title={loadError.title}
            body={loadError.body}
            actionLabel={loadError.actionLabel}
            actionHref={loadError.action === "signin" ? "/login" : loadError.action === "back" ? "/dashboard" : undefined}
            onAction={loadError.action === "signin" || loadError.action === "back" ? undefined : () => void load()}
          />
        )}
        {state === "ready" && (
          <Card className="divide-y divide-line-soft">
            {closeError && (
              <div className="px-5 pt-4">
                <Alert tone="danger" title={closeError.title}>
                  {closeError.body}
                </Alert>
              </div>
            )}
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
                      setCloseError(null);
                      setClosingId(c.cycle_id);
                      try {
                        await authed(`/api/v1/performance/cycles/${c.cycle_id}/close`, undefined, { method: "POST" });
                        await load();
                      } catch (err) {
                        setCloseError(toUserMessage(err, "We couldn't close this review cycle"));
                      } finally {
                        setClosingId("");
                      }
                    }}
                    disabled={closingId === c.cycle_id}
                    className="rounded-full px-2 py-1 text-sm font-semibold text-foggy outline-none transition duration-200 hover:text-hof focus-visible:ring-2 focus-visible:ring-hof/40 active:scale-[0.98] disabled:opacity-60"
                  >
                    {closingId === c.cycle_id ? "Closing…" : "Close"}
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
