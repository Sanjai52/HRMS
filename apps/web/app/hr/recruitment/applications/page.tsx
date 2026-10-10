"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "../../../../components/app-shell";
import { Card, SkeletonRows, StatusPill } from "../../../../components/ui";
import { authed, fmtDay } from "../../../../lib/hr";

interface App {
  application_id: string;
  candidate_id: string;
  candidate_name?: string;
  job_id: string;
  stage: string;
  applied_at: string;
}

function List() {
  const params = useSearchParams();
  const [stage, setStage] = useState(params.get("stage") ?? "");
  const [rows, setRows] = useState<App[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  async function load(s: string) {
    setState("loading");
    try {
      setRows(await authed<App[]>(`/api/v1/recruitment/applications${s ? `?stage=${s}` : ""}`));
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    load(stage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const stages = ["", "APPLIED", "SCREENING", "SHORTLISTED", "ASSESSMENT", "INTERVIEW", "SELECTED", "REJECTED", "WITHDRAWN"];

  return (
    <AppShell title="Applications">
      <div className="mb-4 flex flex-wrap gap-2">
        {stages.map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStage(s)}
            className={`h-9 rounded-full px-4 text-[13px] font-semibold transition ${stage === s ? "bg-hof text-white" : "bg-pearl text-foggy hover:text-hof"}`}
          >
            {s ? s.toLowerCase().replace("_", " ") : "All"}
          </button>
        ))}
      </div>
      {state === "loading" && <SkeletonRows n={4} />}
      {state === "error" && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Could not load applications</p>
        </Card>
      )}
      {state === "ready" && (
        <Card className="divide-y divide-line-soft">
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No applications here.</p>}
          {rows.map((r) => (
            <Link key={r.application_id} href={`/hr/recruitment/applications/${r.application_id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-pearl/60">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-hof">{r.candidate_name ?? r.candidate_id.slice(0, 8)}</p>
                <p className="text-sm text-foggy">Applied {fmtDay(r.applied_at)}</p>
              </div>
              <StatusPill status={r.stage} />
            </Link>
          ))}
        </Card>
      )}
    </AppShell>
  );
}

export default function ApplicationsPage() {
  return (
    <Suspense>
      <List />
    </Suspense>
  );
}
