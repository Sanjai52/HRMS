"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "../../../../components/app-shell";
import { Alert, ErrorState } from "../../../../components/feedback";
import { Card, SkeletonRows, StatusPill } from "../../../../components/ui";
import { toUserMessage, type UserError } from "../../../../lib/errors";
import { fmtDay } from "../../../../lib/format";
import { authedMeta } from "../../../../lib/hr";

interface App {
  application_id: string;
  candidate_id: string;
  candidate_name?: string;
  candidate_email?: string;
  job_id: string;
  job_title?: string | null;
  stage: string;
  applied_at: string;
}

function List() {
  const params = useSearchParams();
  const [stage, setStage] = useState(params.get("stage") ?? "");
  const [rows, setRows] = useState<App[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<UserError | null>(null);
  const [partial, setPartial] = useState(false);

  async function load(s: string) {
    setState("loading");
    setError(null);
    try {
      const body = await authedMeta<App[]>(`/api/v1/recruitment/applications${s ? `?stage=${s}` : ""}`);
      setRows(body.data);
      setPartial(body.meta?.partial === true);
      setState("ready");
    } catch (err) {
      setPartial(false);
      setError(toUserMessage(err, "We couldn't load applications"));
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
            aria-pressed={stage === s}
            onClick={() => setStage(s)}
            className={`h-9 rounded-full px-4 text-[13px] font-semibold transition ${stage === s ? "bg-hof text-white" : "bg-pearl text-foggy hover:text-hof"}`}
          >
            {s ? s.toLowerCase().replace("_", " ") : "All"}
          </button>
        ))}
      </div>
      {state === "loading" && <SkeletonRows n={4} />}
      {state === "error" && error && (
        <ErrorState
          title={error.title}
          body={error.body}
          actionLabel={error.actionLabel}
          actionHref={error.action === "signin" ? "/login" : error.action === "back" ? "/hr/recruitment" : undefined}
          onAction={error.action === "signin" || error.action === "back" ? undefined : () => void load(stage)}
        />
      )}
      {state === "ready" && (
        <div className="grid gap-4">
          {partial && (
            <Alert
              tone="warning"
              action={{ label: "Try again", onClick: () => void load(stage) }}
            >
              Some applications are temporarily unavailable. This list may be incomplete.
            </Alert>
          )}
          <Card className="divide-y divide-line-soft">
            {rows.length === 0 && !partial && <p className="px-5 py-6 text-sm text-foggy">No applications here.</p>}
            {rows.map((r) => (
              <Link key={r.application_id} href={`/hr/recruitment/applications/${r.application_id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-pearl/60">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-hof">{r.candidate_name?.trim() || "Candidate"}</p>
                  <p className="truncate text-sm text-foggy">
                    {r.job_title ?? "Role"} · Applied {fmtDay(r.applied_at)}
                    {r.candidate_email ? ` · ${r.candidate_email}` : ""}
                  </p>
                </div>
                <StatusPill status={r.stage} />
              </Link>
            ))}
          </Card>
        </div>
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
