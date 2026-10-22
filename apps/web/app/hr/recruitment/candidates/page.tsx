"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../../components/app-shell";
import { Alert, ErrorState } from "../../../../components/feedback";
import { Card, SkeletonRows, TextInput } from "../../../../components/ui";
import { toUserMessage, type UserError } from "../../../../lib/errors";
import { initials } from "../../../../lib/format";
import { authedMeta } from "../../../../lib/hr";

interface Cand {
  candidate_id: string;
  name: string;
  email: string;
  source: string;
}

export default function CandidatesPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Cand[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<UserError | null>(null);
  const [partial, setPartial] = useState(false);

  async function load(query: string) {
    setState("loading");
    setError(null);
    try {
      const body = await authedMeta<Cand[]>(`/api/v1/recruitment/candidates${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      setRows(body.data);
      setPartial(body.meta?.partial === true);
      setState("ready");
    } catch (err) {
      setPartial(false);
      setError(toUserMessage(err, "We couldn't load candidates"));
      setState("error");
    }
  }

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Candidate pool">
      <form onSubmit={(e) => { e.preventDefault(); load(q); }} className="mb-4 flex max-w-lg gap-2">
        <TextInput aria-label="Search candidates" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" />
        <button type="submit" className="h-12 shrink-0 rounded-full bg-hof px-6 text-[15px] font-semibold text-white transition hover:bg-black active:scale-[0.98]">
          Search
        </button>
      </form>
      {state === "loading" && <SkeletonRows n={4} />}
      {state === "error" && error && (
        <ErrorState
          title={error.title}
          body={error.body}
          actionLabel={error.actionLabel}
          actionHref={error.action === "signin" ? "/login" : error.action === "back" ? "/hr/recruitment" : undefined}
          onAction={error.action === "signin" || error.action === "back" ? undefined : () => void load(q)}
        />
      )}
      {state === "ready" && (
        <div className="grid gap-4">
          {partial && (
            <Alert
              tone="warning"
              action={{ label: "Try again", onClick: () => void load(q) }}
            >
              Some candidates are temporarily unavailable. This list may be incomplete.
            </Alert>
          )}
          <Card className="divide-y divide-line-soft">
            {rows.length === 0 && !partial && <p className="px-5 py-6 text-sm text-foggy">No candidates yet. Source them or wait for applications.</p>}
            {rows.map((c) => (
              <Link key={c.candidate_id} href={`/hr/recruitment/candidates/${c.candidate_id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-pearl/60">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-extrabold text-primary-ink">
                  {initials(c.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-hof">{c.name?.trim() || "Candidate"}</p>
                  <p className="truncate text-sm text-foggy">{c.email}</p>
                </div>
                <span className="rounded-full bg-pearl px-2.5 py-1 text-xs font-semibold capitalize text-hof">{c.source}</span>
              </Link>
            ))}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
