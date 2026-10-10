"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../../components/app-shell";
import { Card, SkeletonRows, TextInput } from "../../../../components/ui";
import { authed } from "../../../../lib/hr";

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

  async function load(query: string) {
    setState("loading");
    try {
      setRows(await authed<Cand[]>(`/api/v1/recruitment/candidates${query ? `?q=${encodeURIComponent(query)}` : ""}`));
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
    <AppShell title="Candidate pool">
      <form onSubmit={(e) => { e.preventDefault(); load(q); }} className="mb-4 flex max-w-lg gap-2">
        <TextInput aria-label="Search candidates" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" />
        <button type="submit" className="h-12 shrink-0 rounded-full bg-hof px-6 text-[15px] font-semibold text-white transition hover:bg-black active:scale-[0.98]">
          Search
        </button>
      </form>
      {state === "loading" && <SkeletonRows n={4} />}
      {state === "error" && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Could not load candidates</p>
        </Card>
      )}
      {state === "ready" && (
        <Card className="divide-y divide-line-soft">
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No candidates yet. Source them or wait for applications.</p>}
          {rows.map((c) => (
            <Link key={c.candidate_id} href={`/hr/recruitment/candidates/${c.candidate_id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-pearl/60">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rausch/10 text-sm font-extrabold text-rausch-dark">
                {c.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-hof">{c.name}</p>
                <p className="truncate text-sm text-foggy">{c.email}</p>
              </div>
              <span className="rounded-full bg-pearl px-2.5 py-1 text-xs font-semibold capitalize text-hof">{c.source}</span>
            </Link>
          ))}
        </Card>
      )}
    </AppShell>
  );
}
