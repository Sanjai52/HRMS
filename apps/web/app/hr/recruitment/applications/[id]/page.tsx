"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../../../components/app-shell";
import { Button, Card, Field, TextInput, StatusPill, SkeletonRows } from "../../../../../components/ui";
import { authed, fmtDay } from "../../../../../lib/hr";

const FLOW = ["APPLIED", "SCREENING", "SHORTLISTED", "ASSESSMENT", "INTERVIEW", "SELECTED"];

interface Detail {
  application: { application_id: string; job_id: string; stage: string; version: number; applied_at: string };
  candidate: { candidate_id: string; name: string; email: string; phone: string; skills: string[]; experience_years: number; source: string } | null;
  history: Array<{ from_stage: string; to_stage: string; changed_by: string; notes: string; timestamp: string }>;
  interviews: Array<{ interview_id: string; round: string; interviewer: string; scheduled_at: string | null; status: string; feedback: string }>;
  assessments: Array<{ assessment_id: string; type: string; score: string; status: string }>;
}

export default function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [round, setRound] = useState("Technical 1");
  const [interviewer, setInterviewer] = useState("");
  const [aType, setAType] = useState("Take-home");
  const [score, setScore] = useState("");

  async function load() {
    try {
      setD(await authed<Detail>(`/api/v1/recruitment/applications/${id}`));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function move(to: string) {
    if (!d) return;
    setError("");
    setNotice("");
    try {
      await authed(`/api/v1/recruitment/applications/${id}/stage`, undefined, {
        method: "POST",
        body: JSON.stringify({ to, version: d.application.version }),
      });
      setNotice(`Moved to ${to.toLowerCase()}.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function convert() {
    setError("");
    setNotice("");
    try {
      const out = await authed<{ invitationId: string; reused?: boolean }>(`/api/v1/recruitment/applications/${id}/convert`, undefined, { method: "POST" });
      setNotice(out.reused ? "Already converted — same invitation." : "Invitation created for onboarding.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const stage = d?.application.stage ?? "";
  const nexts = FLOW.slice(FLOW.indexOf(stage) + 1, FLOW.indexOf(stage) + 2);
  const terminal = !FLOW.includes(stage);

  return (
    <AppShell title="Application">
      {!d && !error && <SkeletonRows n={4} />}
      {error && !d && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">Could not open this application</p>
          <p className="mt-1 text-sm text-foggy">{error}</p>
        </Card>
      )}
      {d && (
        <div className="grid max-w-3xl gap-6">
          <Card className="p-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-extrabold text-hof">{d.candidate?.name}</p>
                <p className="truncate text-sm text-foggy">{d.candidate?.email} · {(d.candidate?.skills ?? []).join(", ") || "no listed skills"}</p>
              </div>
              <StatusPill status={stage} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Pipeline">
              {FLOW.map((s) => (
                <span key={s} className={`h-1.5 flex-1 rounded-full ${FLOW.indexOf(s) <= FLOW.indexOf(stage) ? "bg-babu" : "bg-line-soft"}`} />
              ))}
            </div>
            {!terminal && (
              <div className="mt-4 flex flex-wrap gap-2">
                {nexts.map((to) => (
                  <button key={to} onClick={() => move(to)} className="h-10 rounded-full bg-hof px-5 text-sm font-semibold text-white transition hover:bg-black active:scale-[0.98]">
                    Move to {to.toLowerCase()}
                  </button>
                ))}
                <button onClick={() => move("REJECTED")} className="h-10 rounded-full border border-line px-5 text-sm font-semibold text-hof transition hover:bg-pearl active:scale-[0.98]">
                  Reject
                </button>
              </div>
            )}
            {stage === "SELECTED" && (
              <Button onClick={convert} className="mt-3">Convert to employee</Button>
            )}
            {notice && <p className="mt-3 text-sm font-medium text-babu">{notice}</p>}
            {error && (
              <p role="alert" className="mt-3 text-sm font-medium text-rausch-dark">
                {error}
              </p>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-bold text-hof">Interviews</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await authed(`/api/v1/recruitment/applications/${id}/interviews`, undefined, { method: "POST", body: JSON.stringify({ round, interviewer }) });
                setInterviewer("");
                await load();
              }}
              className="mt-3 grid gap-3 sm:grid-cols-3"
            >
              <Field label="Round">
                <TextInput value={round} onChange={(e) => setRound(e.target.value)} required />
              </Field>
              <Field label="Interviewer">
                <TextInput value={interviewer} onChange={(e) => setInterviewer(e.target.value)} placeholder="Name" />
              </Field>
              <div className="flex items-end">
                <Button type="submit" className="w-full">Schedule</Button>
              </div>
            </form>
            <ul className="mt-3 grid gap-2">
              {d.interviews.map((iv) => (
                <li key={iv.interview_id} className="flex flex-wrap items-center gap-2 rounded-input bg-pearl px-4 py-2.5 text-sm">
                  <span className="font-semibold text-hof">{iv.round}</span>
                  <span className="text-foggy">{iv.interviewer || "unassigned"}</span>
                  <StatusPill status={iv.status} />
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-bold text-hof">Assessments</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await authed(`/api/v1/recruitment/applications/${id}/assessments`, undefined, { method: "POST", body: JSON.stringify({ type: aType, score }) });
                setScore("");
                await load();
              }}
              className="mt-3 grid gap-3 sm:grid-cols-3"
            >
              <Field label="Type">
                <TextInput value={aType} onChange={(e) => setAType(e.target.value)} required />
              </Field>
              <Field label="Score / result">
                <TextInput value={score} onChange={(e) => setScore(e.target.value)} placeholder="e.g. 8/10" />
              </Field>
              <div className="flex items-end">
                <Button type="submit" className="w-full">Record</Button>
              </div>
            </form>
            <ul className="mt-3 grid gap-2">
              {d.assessments.map((a) => (
                <li key={a.assessment_id} className="flex flex-wrap items-center gap-2 rounded-input bg-pearl px-4 py-2.5 text-sm">
                  <span className="font-semibold text-hof">{a.type}</span>
                  <span className="text-foggy">{a.score || a.status}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-bold text-hof">History</h2>
            <ul className="mt-3 grid gap-2 text-sm">
              {d.history.map((h, i) => (
                <li key={i} className="text-foggy">
                  <span className="font-semibold text-hof">{h.from_stage || "—"} → {h.to_stage}</span> · {fmtDay(h.timestamp)}{h.notes ? ` · ${h.notes}` : ""}
                </li>
              ))}
            </ul>
            <Link href="/hr/recruitment/applications" className="mt-4 inline-block text-sm font-semibold text-hof underline underline-offset-4">
              Back to applications
            </Link>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
