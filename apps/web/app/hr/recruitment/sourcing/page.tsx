"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../../components/app-shell";
import { Alert, ErrorState } from "../../../../components/feedback";
import { Button, Card, Field, TextInput, SkeletonRows, StatusPill } from "../../../../components/ui";
import { authed } from "../../../../lib/hr";
import { toUserMessage } from "../../../../lib/errors";

interface Run {
  run_id: string;
  role: string;
  skills: string[];
  status: string;
  pages: number;
  discovered: number;
  imported: number;
  errors: number;
  created_at: string;
}

export default function SourcingPage() {
  const [role, setRole] = useState("Backend Engineer");
  const [skills, setSkills] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [loadError, setLoadError] = useState<{ title: string; body: string } | null>(null);
  const [startError, setStartError] = useState<{ title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await authed<Run[]>("/api/v1/recruitment/sourcing/runs");
      setRuns(data);
      setLoadError(null);
      setState("ready");
    } catch (err) {
      // Keep any rows already on screen; the error is reported alongside them.
      const message = toUserMessage(err, "We couldn't load sourcing runs");
      setLoadError({ title: message.title, body: message.body });
      setState("error");
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStartError(null);
    setBusy(true);
    try {
      await authed("/api/v1/recruitment/sourcing/runs", undefined, {
        method: "POST",
        body: JSON.stringify({ role, skills: skills.split(",").map((s) => s.trim()).filter(Boolean) }),
      });
      setSkills("");
      await load();
    } catch (err) {
      const message = toUserMessage(err, "We couldn't start sourcing");
      setStartError({ title: message.title, body: message.body });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Candidate sourcing">
      <div className="grid max-w-3xl gap-6">
        <Card className="p-6">
          <h2 className="text-lg font-bold text-hof">Discover from the candidate portal</h2>
          <p className="mt-1 text-sm text-foggy">Set a role and skills. The crawler visits the portal, normalizes profiles and imports new candidates without duplicates.</p>
          <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Target role">
              <TextInput value={role} onChange={(e) => setRole(e.target.value)} placeholder="Backend Engineer" />
            </Field>
            <Field label="Skills (comma separated, optional)">
              <TextInput value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="node.js, postgres" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy} className="w-full disabled:opacity-60">
                {busy ? "Starting…" : "Start sourcing"}
              </Button>
            </div>
          </form>
          {startError && (
            <div className="mt-4">
              <Alert tone="danger" title={startError.title}>
                {startError.body}
              </Alert>
            </div>
          )}
        </Card>
        {state === "loading" && runs.length === 0 && <SkeletonRows n={3} />}
        {state === "error" && loadError && runs.length === 0 && (
          <ErrorState
            title={loadError.title}
            body={loadError.body}
            actionLabel="Try again"
            onAction={() => void load()}
            secondaryLabel="Back to recruitment"
            secondaryHref="/hr/recruitment"
          />
        )}
        {loadError && runs.length > 0 && (
          <Alert
            tone="danger"
            title={loadError.title}
            action={{ label: "Try again", onClick: () => void load() }}
          >
            {loadError.body}
          </Alert>
        )}
        {(state === "ready" || runs.length > 0) && (
          <Card className="divide-y divide-line-soft">
            <h2 className="px-5 pt-5 text-lg font-bold text-hof">Runs</h2>
            {runs.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No sourcing runs yet.</p>}
            {runs.map((r) => (
              <Link key={r.run_id} href={`/hr/recruitment/sourcing/${r.run_id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-pearl/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-hof">{r.role || "General sourcing"}</p>
                  <p className="text-sm text-foggy">
                    {r.pages} pages · {r.discovered} found · {r.imported} imported
                    {r.errors > 0 && ` · ${r.errors} ${r.errors === 1 ? "page" : "pages"} couldn't be read`}
                  </p>
                </div>
                <StatusPill status={r.status} />
              </Link>
            ))}
          </Card>
        )}
      </div>
    </AppShell>
  );
}
