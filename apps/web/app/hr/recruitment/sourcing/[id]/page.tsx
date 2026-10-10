"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../../../components/app-shell";
import { Card, SkeletonRows, StatusPill } from "../../../../../components/ui";
import { authed } from "../../../../../lib/hr";

interface Detail {
  run: { run_id: string; role: string; skills: string[]; status: string; pages: number; discovered: number; imported: number; errors: number };
  pages: Array<{ url: string; status: number; error: string }>;
}

export default function RunDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const data = await authed<Detail>(`/api/v1/recruitment/sourcing/runs/${id}`);
        if (!stop) setD(data);
        return data.run.status;
      } catch {
        return "UNKNOWN";
      }
    };
    load();
    const t = setInterval(async () => {
      const s = await load();
      if (["COMPLETED", "PARTIAL_FAILED", "FAILED"].includes(s)) clearInterval(t);
    }, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [id]);

  return (
    <AppShell title="Sourcing run">
      {!d && <SkeletonRows n={3} />}
      {d && (
        <div className="grid max-w-3xl gap-6">
          <Card className="flex flex-wrap items-center gap-4 p-6">
            <div className="min-w-0 flex-1">
              <p className="text-xl font-extrabold text-hof">{d.run.role || "General sourcing"}</p>
              <p className="text-sm text-foggy">{(d.run.skills ?? []).join(", ") || "no skill filter"}</p>
              <p className="mt-1 text-sm text-foggy">{d.run.pages} pages · {d.run.discovered} found · {d.run.imported} imported · {d.run.errors} errors</p>
            </div>
            <StatusPill status={d.run.status} />
          </Card>
          <Card className="divide-y divide-line-soft">
            <h2 className="px-5 pt-5 text-lg font-bold text-hof">Pages visited</h2>
            {d.pages.map((p) => (
              <div key={p.url} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-mono text-hof">{p.url}</span>
                {p.status !== 200 ? (
                  <span className="rounded-full bg-arches/10 px-2.5 py-1 text-xs font-semibold text-arches">{p.status || "error"} · {p.error}</span>
                ) : (
                  <span className="rounded-full bg-babu/10 px-2.5 py-1 text-xs font-semibold text-babu">200</span>
                )}
              </div>
            ))}
          </Card>
          <Link href="/hr/recruitment/candidates" className="text-sm font-semibold text-hof underline underline-offset-4">
            Open candidate pool
          </Link>
        </div>
      )}
    </AppShell>
  );
}
