"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../../../components/app-shell";
import { ErrorState } from "../../../../../components/feedback";
import { Card, SkeletonRows, StatusPill } from "../../../../../components/ui";
import { toUserMessage, type UserError } from "../../../../../lib/errors";
import { fmtDay } from "../../../../../lib/format";
import { authed } from "../../../../../lib/hr";

interface Detail {
  candidate: { candidate_id: string; name: string; email: string; phone: string; skills: string[]; experience_years: number; source: string };
  applications: Array<{ application_id: string; job_id: string; job_title?: string | null; stage: string; applied_at: string }>;
}

export default function CandidateDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<UserError | null>(null);

  useEffect(() => {
    let cancelled = false;
    setD(null);
    setError(null);

    async function load() {
      try {
        const detail = await authed<Detail>(`/api/v1/recruitment/candidates/${id}`);
        if (!cancelled) setD(detail);
      } catch (err) {
        if (!cancelled) setError(toUserMessage(err, "We couldn't open this candidate"));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <AppShell title={d ? d.candidate.name : "Candidate"}>
      {!d && !error && <SkeletonRows n={3} />}
      {error && (
        <ErrorState
          title={error.title}
          body={error.body}
          actionLabel={error.action === "back" ? "Back to candidate pool" : error.actionLabel}
          actionHref={error.action === "signin" ? "/login" : error.action === "back" ? "/hr/recruitment/candidates" : undefined}
          onAction={error.action === "signin" || error.action === "back" ? undefined : () => window.location.reload()}
        />
      )}
      {d && (
        <div className="grid max-w-3xl gap-6">
          <Card className="p-6">
            <p className="text-xl font-extrabold text-hof">{d.candidate.name}</p>
            <p className="text-sm text-foggy">{d.candidate.email}{d.candidate.phone ? ` · ${d.candidate.phone}` : ""}</p>
            <p className="mt-2 text-sm text-hof">{d.candidate.experience_years} yrs · {(d.candidate.skills ?? []).join(", ") || "no listed skills"} · via {d.candidate.source}</p>
          </Card>
          <Card className="divide-y divide-line-soft">
            <h2 className="px-5 pt-5 text-lg font-bold text-hof">Applications</h2>
            {d.applications.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No applications.</p>}
            {d.applications.map((a) => (
              <Link key={a.application_id} href={`/hr/recruitment/applications/${a.application_id}`} className="flex items-center gap-3 px-5 py-4 transition hover:bg-pearl/60">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-hof">{a.job_title ?? "Role"}</p>
                  <p className="text-sm text-foggy">Applied {fmtDay(a.applied_at)}</p>
                </div>
                <StatusPill status={a.stage} />
              </Link>
            ))}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
