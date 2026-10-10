"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { Card, SkeletonRows } from "../../../components/ui";
import { authed } from "../../../lib/hr";

const ORDER = ["APPLIED", "SCREENING", "SHORTLISTED", "ASSESSMENT", "INTERVIEW", "SELECTED", "REJECTED", "WITHDRAWN"];

export default function RecruitmentPage() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    authed<Array<{ stage: string }>>("/api/v1/recruitment/applications")
      .then((apps) => {
        const c: Record<string, number> = {};
        for (const a of apps) c[a.stage] = (c[a.stage] ?? 0) + 1;
        setCounts(c);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  return (
    <AppShell title="Recruitment">
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/hr/recruitment/jobs" className="inline-flex h-11 items-center rounded-full bg-hof px-5 text-sm font-semibold text-white transition hover:bg-black active:scale-[0.98]">
          Job postings
        </Link>
        <Link href="/hr/recruitment/jobs/new" className="inline-flex h-11 items-center rounded-full bg-rausch px-5 text-sm font-semibold text-white transition hover:bg-rausch-dark active:scale-[0.98]">
          New opening
        </Link>
        <Link href="/hr/recruitment/applications" className="inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-hof transition hover:bg-pearl active:scale-[0.98]">
          Applications
        </Link>
        <Link href="/hr/recruitment/candidates" className="inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-hof transition hover:bg-pearl active:scale-[0.98]">
          Candidate pool
        </Link>
        <Link href="/hr/recruitment/sourcing" className="inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-hof transition hover:bg-pearl active:scale-[0.98]">
          Sourcing
        </Link>
      </div>
      {state === "loading" && <SkeletonRows n={3} />}
      {state === "error" && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Could not load the pipeline</p>
        </Card>
      )}
      {state === "ready" && (
        <div className="grid gap-4 sm:grid-cols-4">
          {ORDER.map((s) => (
            <Link key={s} href={`/hr/recruitment/applications?stage=${s}`}>
              <Card className="p-5 transition hover:shadow-pop">
                <p className="text-sm font-medium capitalize text-foggy">{s.toLowerCase().replace("_", " ")}</p>
                <p className="mt-1 text-3xl font-extrabold text-hof">{counts[s] ?? 0}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
