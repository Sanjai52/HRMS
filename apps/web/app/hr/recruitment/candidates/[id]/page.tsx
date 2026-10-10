"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../../../components/app-shell";
import { Card, SkeletonRows, StatusPill } from "../../../../../components/ui";
import { authed, fmtDay } from "../../../../../lib/hr";

interface Detail {
  candidate: { candidate_id: string; name: string; email: string; phone: string; skills: string[]; experience_years: number; source: string };
  applications: Array<{ application_id: string; job_id: string; stage: string; applied_at: string }>;
}

export default function CandidateDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    authed<Detail>(`/api/v1/recruitment/candidates/${id}`)
      .then(setD)
      .catch((err) => setError((err as Error).message));
  }, [id]);

  return (
    <AppShell title={d ? d.candidate.name : "Candidate"}>
      {!d && !error && <SkeletonRows n={3} />}
      {error && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Could not open this candidate</p>
          <p className="mt-1 text-sm text-foggy">{error}</p>
        </Card>
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
                  <p className="text-[15px] font-semibold text-hof">Application</p>
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
