"use client";
import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../../../components/app-shell";
import { Alert, ErrorState } from "../../../../../components/feedback";
import { Button, Card, Field, TextInput, StatusPill, SkeletonRows } from "../../../../../components/ui";
import { toUserMessage, type UserError } from "../../../../../lib/errors";
import { fmtDay } from "../../../../../lib/format";
import { authed } from "../../../../../lib/hr";

const FLOW = ["APPLIED", "SCREENING", "SHORTLISTED", "ASSESSMENT", "INTERVIEW", "SELECTED"];

interface Detail {
  application: { application_id: string; job_id: string; stage: string; version: number; applied_at: string };
  candidate: { candidate_id: string; name: string; email: string; phone: string; skills: string[]; experience_years: number; source: string } | null;
  history: Array<{ from_stage: string; to_stage: string; changed_by: string; notes: string; timestamp: string }>;
  interviews: Array<{ interview_id: string; round: string; interviewer: string; scheduled_at: string | null; status: string; feedback: string }>;
  assessments: Array<{ assessment_id: string; type: string; score: string; status: string }>;
}

function stageLabel(value: string): string {
  return value ? value.replace(/_/g, " ").toLowerCase() : "—";
}

export default function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<UserError | null>(null);
  const [refreshError, setRefreshError] = useState<UserError | null>(null);
  const [stageError, setStageError] = useState<UserError | null>(null);
  const [interviewError, setInterviewError] = useState<UserError | null>(null);
  const [assessmentError, setAssessmentError] = useState<UserError | null>(null);
  const [stageNotice, setStageNotice] = useState("");
  const [interviewNotice, setInterviewNotice] = useState("");
  const [assessmentNotice, setAssessmentNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState("Technical 1");
  const [interviewer, setInterviewer] = useState("");
  const [aType, setAType] = useState("Take-home");
  const [score, setScore] = useState("");
  const activeIdRef = useRef(id);
  const dRef = useRef<Detail | null>(null);

  async function load(targetId = id, isCurrent = () => activeIdRef.current === targetId) {
    try {
      const detail = await authed<Detail>(`/api/v1/recruitment/applications/${targetId}`);
      if (!isCurrent()) return;
      dRef.current = detail;
      setD(detail);
      setLoadError(null);
      setRefreshError(null);
    } catch (err) {
      if (!isCurrent()) return;
      const message = toUserMessage(err, "We couldn't open this application");
      if (dRef.current?.application.application_id === targetId) {
        setRefreshError(message);
      } else {
        setLoadError(message);
      }
    }
  }

  useEffect(() => {
    activeIdRef.current = id;
    let cancelled = false;
    const isCurrent = () => !cancelled && activeIdRef.current === id;

    dRef.current = null;
    setD(null);
    setLoadError(null);
    setRefreshError(null);
    setStageError(null);
    setInterviewError(null);
    setAssessmentError(null);
    setStageNotice("");
    setInterviewNotice("");
    setAssessmentNotice("");
    setBusy(false);
    setRound("Technical 1");
    setInterviewer("");
    setAType("Take-home");
    setScore("");

    void load(id, isCurrent);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function clearStageFeedback() {
    setStageError(null);
    setStageNotice("");
  }

  async function move(to: string) {
    const current = dRef.current;
    if (!current || current.application.application_id !== id) return;
    const targetId = id;
    setStageError(null);
    setStageNotice("");
    setBusy(true);
    try {
      await authed(`/api/v1/recruitment/applications/${targetId}/stage`, undefined, {
        method: "POST",
        body: JSON.stringify({ to, version: current.application.version }),
      });
      if (activeIdRef.current !== targetId) return;
      setStageNotice(`Moved to ${stageLabel(to)}.`);
      await load(targetId);
    } catch (err) {
      if (activeIdRef.current !== targetId) return;
      setStageError(toUserMessage(err, "We couldn't move this application"));
    } finally {
      if (activeIdRef.current === targetId) setBusy(false);
    }
  }

  async function convert() {
    const current = dRef.current;
    if (!current || current.application.application_id !== id) return;
    const targetId = id;
    setStageError(null);
    setStageNotice("");
    setBusy(true);
    try {
      const out = await authed<{ invitationId: string; reused?: boolean }>(`/api/v1/recruitment/applications/${targetId}/convert`, undefined, { method: "POST" });
      if (activeIdRef.current !== targetId) return;
      setStageNotice(out.reused ? "Already converted — the same invitation is in use." : "Invitation created for onboarding.");
      await load(targetId);
    } catch (err) {
      if (activeIdRef.current !== targetId) return;
      setStageError(toUserMessage(err, "We couldn't create the invitation"));
    } finally {
      if (activeIdRef.current === targetId) setBusy(false);
    }
  }

  async function scheduleInterview(e: React.FormEvent) {
    e.preventDefault();
    const current = dRef.current;
    if (!current || current.application.application_id !== id) return;
    const targetId = id;
    setInterviewError(null);
    setInterviewNotice("");
    setBusy(true);
    try {
      await authed(`/api/v1/recruitment/applications/${targetId}/interviews`, undefined, { method: "POST", body: JSON.stringify({ round, interviewer }) });
      if (activeIdRef.current !== targetId) return;
      setInterviewer("");
      setInterviewNotice("Interview scheduled.");
      await load(targetId);
    } catch (err) {
      if (activeIdRef.current !== targetId) return;
      setInterviewError(toUserMessage(err, "We couldn't schedule this interview"));
    } finally {
      if (activeIdRef.current === targetId) setBusy(false);
    }
  }

  async function recordAssessment(e: React.FormEvent) {
    e.preventDefault();
    const current = dRef.current;
    if (!current || current.application.application_id !== id) return;
    const targetId = id;
    setAssessmentError(null);
    setAssessmentNotice("");
    setBusy(true);
    try {
      await authed(`/api/v1/recruitment/applications/${targetId}/assessments`, undefined, { method: "POST", body: JSON.stringify({ type: aType, score }) });
      if (activeIdRef.current !== targetId) return;
      setScore("");
      setAssessmentNotice("Assessment recorded.");
      await load(targetId);
    } catch (err) {
      if (activeIdRef.current !== targetId) return;
      setAssessmentError(toUserMessage(err, "We couldn't record this assessment"));
    } finally {
      if (activeIdRef.current === targetId) setBusy(false);
    }
  }

  const stage = d?.application.stage ?? "";
  const nexts = FLOW.slice(FLOW.indexOf(stage) + 1, FLOW.indexOf(stage) + 2);
  const terminal = !FLOW.includes(stage);

  return (
    <AppShell title="Application">
      {!d && !loadError && <SkeletonRows n={4} />}
      {loadError && !d && (
        <ErrorState
          title={loadError.title}
          body={loadError.body}
          actionLabel={loadError.action === "back" ? "Back to applications" : loadError.actionLabel}
          actionHref={loadError.action === "signin" ? "/login" : loadError.action === "back" ? "/hr/recruitment/applications" : undefined}
          onAction={loadError.action === "signin" || loadError.action === "back" ? undefined : () => window.location.reload()}
        />
      )}
      {d && (
        <div className="grid max-w-3xl gap-6">
          <Card className="p-6">
            {refreshError && (
              <Alert
                tone="warning"
                title={refreshError.title}
                className="mb-3"
                action={{ label: "Try again", onClick: () => void load() }}
              >
                The details below may be out of date.
              </Alert>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-extrabold text-hof">{d.candidate?.name?.trim() || "Candidate"}</p>
                <p className="truncate text-sm text-foggy">{d.candidate?.email} · {(d.candidate?.skills ?? []).join(", ") || "no listed skills"}</p>
              </div>
              <StatusPill status={stage} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Pipeline">
              {FLOW.map((s) => (
                <span key={s} className={`h-1.5 flex-1 rounded-full ${FLOW.indexOf(s) <= FLOW.indexOf(stage) ? "bg-success" : "bg-line-soft"}`} />
              ))}
            </div>
            {!terminal && (
              <div className="mt-4 flex flex-wrap gap-2">
                {nexts.map((to) => (
                  <button key={to} onClick={() => move(to)} disabled={busy} className="h-10 rounded-full bg-hof px-5 text-sm font-semibold text-white transition hover:bg-black active:scale-[0.98] disabled:opacity-60">
                    Move to {stageLabel(to)}
                  </button>
                ))}
                <button onClick={() => move("REJECTED")} disabled={busy} className="h-10 rounded-full border border-line px-5 text-sm font-semibold text-hof transition hover:bg-pearl active:scale-[0.98] disabled:opacity-60">
                  Reject
                </button>
              </div>
            )}
            {stage === "SELECTED" && (
              <Button onClick={convert} disabled={busy} className="mt-3 disabled:opacity-60">Convert to employee</Button>
            )}
            {stageNotice && (
              <Alert tone="success" className="mt-3">
                {stageNotice}
              </Alert>
            )}
            {stageError && (
              <Alert
                tone="danger"
                title={stageError.title}
                className="mt-3"
                action={{
                  label: "Refresh",
                  onClick: () => {
                    clearStageFeedback();
                    void load();
                  },
                }}
              >
                {stageError.body}
              </Alert>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-bold text-hof">Interviews</h2>
            <form onSubmit={scheduleInterview} className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Round">
                <TextInput value={round} onChange={(e) => setRound(e.target.value)} required />
              </Field>
              <Field label="Interviewer">
                <TextInput value={interviewer} onChange={(e) => setInterviewer(e.target.value)} placeholder="Name" />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={busy} className="w-full disabled:opacity-60">Schedule</Button>
              </div>
            </form>
            {interviewNotice && (
              <Alert tone="success" className="mt-3">
                {interviewNotice}
              </Alert>
            )}
            {interviewError && (
              <Alert tone="danger" title={interviewError.title} className="mt-3">
                {interviewError.body}
              </Alert>
            )}
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
            <form onSubmit={recordAssessment} className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Type">
                <TextInput value={aType} onChange={(e) => setAType(e.target.value)} required />
              </Field>
              <Field label="Score / result">
                <TextInput value={score} onChange={(e) => setScore(e.target.value)} placeholder="e.g. 8/10" />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={busy} className="w-full disabled:opacity-60">Record</Button>
              </div>
            </form>
            {assessmentNotice && (
              <Alert tone="success" className="mt-3">
                {assessmentNotice}
              </Alert>
            )}
            {assessmentError && (
              <Alert tone="danger" title={assessmentError.title} className="mt-3">
                {assessmentError.body}
              </Alert>
            )}
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
                  <span className="font-semibold text-hof">{stageLabel(h.from_stage)} → {stageLabel(h.to_stage)}</span> · {fmtDay(h.timestamp)}{h.notes ? ` · ${h.notes}` : ""}
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
