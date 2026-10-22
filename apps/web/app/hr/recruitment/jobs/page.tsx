"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../../components/app-shell";
import { ErrorState } from "../../../../components/feedback";
import { Card, SkeletonRows, StatusPill } from "../../../../components/ui";
import { toUserMessage, type UserError } from "../../../../lib/errors";
import { authed } from "../../../../lib/hr";

interface Job {
  job_id: string;
  slug: string;
  title: string;
  department: string;
  location: string;
  // This endpoint returns open roles only and does not include a status.
  status?: string;
}

export default function JobsPage() {
  const [rows, setRows] = useState<Job[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<UserError | null>(null);

  async function load() {
    setState("loading");
    setError(null);
    try {
      setRows(await authed<Job[]>("/api/v1/jobs"));
      setState("ready");
    } catch (err) {
      setError(toUserMessage(err, "We couldn't load job openings"));
      setState("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Job postings">
      <div className="grid max-w-3xl gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-foggy">Open roles are visible on the public careers page.</p>
          <Link
            href="/hr/recruitment/jobs/new"
            className="inline-flex h-11 shrink-0 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary-hover active:scale-[0.98]"
          >
            New opening
          </Link>
        </div>
        {state === "error" && error ? (
          <ErrorState
            title={error.title}
            body={error.body}
            actionLabel={error.actionLabel}
            actionHref={error.action === "signin" ? "/login" : error.action === "back" ? "/hr/recruitment" : undefined}
            onAction={error.action === "signin" || error.action === "back" ? undefined : () => void load()}
          />
        ) : (
          <Card className="divide-y divide-line-soft">
            {state === "loading" && <div className="p-5"><SkeletonRows n={3} /></div>}
            {state === "ready" && rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No open roles.</p>}
            {state === "ready" &&
              rows.map((j) => (
                <div key={j.job_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-hof">{j.title}</p>
                    <p className="truncate text-sm text-foggy">{j.department} · {j.location}</p>
                  </div>
                  <StatusPill status={j.status ?? "OPEN"} />
                  <Link href={`/jobs/${j.slug}`} className="text-sm font-semibold text-hof underline underline-offset-4">
                    Public page
                  </Link>
                </div>
              ))}
          </Card>
        )}
      </div>
    </AppShell>
  );
}
