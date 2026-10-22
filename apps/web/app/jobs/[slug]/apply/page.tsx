"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, ErrorState, LoadingState } from "../../../../components/feedback";
import { Button, Card, Field, TextInput } from "../../../../components/ui";
import { requestJson } from "../../../../lib/api";
import {
  ApiError,
  defaultUserMessage,
  isApiError,
  statusKind,
  toUserMessage,
} from "../../../../lib/errors";

interface JobSummary {
  jobId: string;
  title: string;
}

interface SafeMessage {
  title: string;
  body: string;
}

type CopyState = "idle" | "copied" | "failed";

/**
 * Turn a non-OK response from the multipart endpoint into a typed error without
 * forwarding any backend text. Only the machine code is read, and only so
 * `toUserMessage` can apply its known-code copy.
 */
async function failureFrom(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: unknown } } | null;
  const code = typeof body?.error?.code === "string" ? body.error.code : undefined;
  const kind = statusKind(res.status);
  return new ApiError(kind, res.status, { code, userMessage: defaultUserMessage(kind) });
}

export default function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [job, setJob] = useState<JobSummary | null>(null);
  const [loadError, setLoadError] = useState<SafeMessage | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [experience, setExperience] = useState("");
  const [skills, setSkills] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [error, setError] = useState<SafeMessage | null>(null);
  const [busy, setBusy] = useState(false);
  // The status token is held in memory only, so the copy action can build the
  // private link without ever putting the token or URL in the DOM.
  const [token, setToken] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const loadJob = useCallback(async () => {
    setLoadingJob(true);
    setLoadError(null);
    try {
      const { data } = await requestJson<{ job_id: string; title: string }>(
        `/api/v1/jobs/${encodeURIComponent(slug)}`
      );
      if (!data || typeof data.job_id !== "string" || !data.job_id) {
        setJob(null);
        setLoadError({ title: "We couldn't load this role", body: "Try again in a moment." });
        return;
      }
      setJob({ jobId: data.job_id, title: data.title?.trim() || "this role" });
    } catch (err) {
      setJob(null);
      if (isApiError(err) && err.status === 404) {
        setLoadError({
          title: "This role is no longer open",
          body: "It may have closed since you opened this page. Browse the other open roles.",
        });
      } else {
        const message = toUserMessage(err, "We couldn't load this role");
        setLoadError({ title: message.title, body: message.body });
      }
    } finally {
      setLoadingJob(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadJob();
  }, [loadJob]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!job) {
      setError({ title: "Role details are still loading", body: "Wait a moment and try again." });
      return;
    }
    setError(null);
    setCopyState("idle");
    setBusy(true);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
      const form = new FormData();
      form.set("name", name);
      form.set("email", email);
      form.set("phone", phone);
      form.set("experience", experience || "0");
      form.set("skills", skills);
      if (file) form.set("resume", file);

      const res = await fetch(`${base}/api/v1/recruitment/jobs/${encodeURIComponent(job.jobId)}/applications`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw await failureFrom(res);

      const body = (await res.json()) as { data?: { statusToken?: string } };
      if (!body.data?.statusToken) {
        setError({
          title: "We couldn't confirm your application",
          body: "Your details may have been received. Check your email for a confirmation before trying again.",
        });
        return;
      }
      setToken(body.data.statusToken);
    } catch (err) {
      const message = toUserMessage(err, "We couldn't submit your application");
      setError({ title: message.title, body: message.body });
    } finally {
      setBusy(false);
    }
  }

  async function copyStatusLink() {
    if (!token) return;
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(
        `${window.location.origin}/application-status?token=${encodeURIComponent(token)}`
      );
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center px-4 sm:px-6">
          <Link href="/jobs" className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
            <span className="grid h-8 w-8 place-items-center rounded-control bg-brand text-sm font-semibold text-ink-inverse">
              H
            </span>
            HRMS
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6 sm:py-14">
        {loadingJob ? (
          <LoadingState rows={3} />
        ) : loadError ? (
          <ErrorState
            title={loadError.title}
            body={loadError.body}
            actionLabel="Try again"
            onAction={loadJob}
            secondaryLabel="Back to open roles"
            secondaryHref="/jobs"
          />
        ) : token ? (
          <Card className="p-6 md:p-8">
            <h1 className="text-[25px] font-semibold leading-tight tracking-[-0.02em] text-ink">Application received</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
              We&apos;ve saved your application for {job?.title ?? "this role"}. Copy a private status link, or check your
              email for updates.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button type="button" size="lg" onClick={copyStatusLink}>
                Copy status link
              </Button>
              <Link
                href="/jobs"
                className="inline-flex h-10 items-center rounded-control border border-line bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-muted"
              >
                Back to open roles
              </Link>
            </div>

            {copyState === "copied" && (
              <p role="status" className="mt-3 text-[13px] font-medium text-success">
                Status link copied.
              </p>
            )}
            {copyState === "failed" && (
              <p role="status" className="mt-3 text-[13px] leading-relaxed text-ink-secondary">
                We couldn&apos;t copy the link. You can open the link from your confirmation email.
              </p>
            )}
          </Card>
        ) : (
          <Card className="p-6 md:p-8">
            <h1 className="text-[25px] font-semibold leading-tight tracking-[-0.02em] text-ink">
              Apply{job ? ` for ${job.title}` : ""}
            </h1>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
              Takes about two minutes. Resume optional (PDF or Word, 5 MB).
            </p>

            {error && (
              <div className="mt-5">
                <Alert tone="danger" title={error.title}>
                  {error.body}
                </Alert>
              </div>
            )}

            <form onSubmit={submit} className="mt-6 grid gap-4">
              <Field label="Full name" htmlFor="apply-name" required>
                <TextInput
                  id="apply-name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                />
              </Field>
              <Field label="Email address" htmlFor="apply-email" required>
                <TextInput
                  id="apply-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Phone (optional)" htmlFor="apply-phone">
                <TextInput
                  id="apply-phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Field label="Years of experience" htmlFor="apply-experience">
                <TextInput
                  id="apply-experience"
                  inputMode="numeric"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Key skills (comma separated)" htmlFor="apply-skills">
                <TextInput
                  id="apply-skills"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="Node.js, Postgres"
                />
              </Field>
              <Field label="Resume (optional)" htmlFor="apply-resume">
                <input
                  id="apply-resume"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink-secondary file:mr-3 file:rounded-control file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink"
                />
              </Field>
              <Button type="submit" size="lg" loading={busy} className="mt-1 w-full">
                Submit application
              </Button>
            </form>
          </Card>
        )}
      </main>
    </div>
  );
}
