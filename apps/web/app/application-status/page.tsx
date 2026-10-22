"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Alert, LoadingState } from "../../components/feedback";
import { Card, StatusPill } from "../../components/ui";
import { requestJson } from "../../lib/api";
import { isApiError, toUserMessage } from "../../lib/errors";
import { fmtDateTime } from "../../lib/format";

interface StatusData {
  jobTitle: string;
  stage: string;
  applied_at: string;
  updated_at?: string;
}

interface SafeMessage {
  title: string;
  body: string;
}

function Tracker() {
  // The token travels in the URL only. It is never copied into rendered text,
  // an input, or an error message.
  const params = useSearchParams();
  const token = (params.get("token") ?? "").trim();

  const [result, setResult] = useState<StatusData | null>(null);
  const [error, setError] = useState<SafeMessage | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(false);

  const check = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setExpired(false);
    try {
      const { data } = await requestJson<StatusData>(
        `/api/v1/recruitment/application-status/${encodeURIComponent(token)}`
      );
      setResult(data);
    } catch (err) {
      if (isApiError(err) && (err.status === 404 || err.status === 410)) {
        setExpired(true);
      } else {
        const message = toUserMessage(err, "We couldn't check this status link");
        setError({ title: message.title, body: message.body });
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void check();
  }, [check]);

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
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">Application status</p>
          <h1 className="mt-1 text-[25px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            Track your application
          </h1>
        </div>

        {!token && (
          <Card className="p-6 md:p-8">
            <Alert tone="info" title="Open your status link">
              Use the private link from your application confirmation email.
            </Alert>
            <p className="mt-4 text-[13px] leading-relaxed text-ink-secondary">
              The link opens this page with your application details. If you can&apos;t find it, ask the recruiter to
              resend your confirmation.
            </p>
            <Link
              href="/jobs"
              className="mt-5 inline-flex h-9 items-center rounded-control border border-line bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              Back to open roles
            </Link>
          </Card>
        )}

        {token && loading && <LoadingState rows={3} />}

        {token && !loading && expired && (
          <Card className="p-6 md:p-8">
            <div role="alert">
              <Alert
                tone="warning"
                title="This status link has expired"
                action={{ label: "Back to open roles", href: "/jobs" }}
              >
                Ask the recruiter to send a new one.
              </Alert>
            </div>
          </Card>
        )}

        {token && !loading && error && (
          <Card className="p-6 md:p-8">
            <Alert
              tone="danger"
              title={error.title}
              action={{ label: "Try again", onClick: () => void check() }}
            >
              {error.body}
            </Alert>
            <Link
              href="/jobs"
              className="mt-5 inline-flex h-9 items-center rounded-control border border-line bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              Back to open roles
            </Link>
          </Card>
        )}

        {token && !loading && result && (
          <Card className="p-6 md:p-8">
            <p className="text-[13px] font-medium text-ink-secondary">Your application for</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink">
              {result.jobTitle?.trim() || "this role"}
            </h2>
            <div className="mt-3">
              <StatusPill status={result.stage || "APPLIED"} />
            </div>

            <dl className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-ink-secondary">Applied</dt>
                <dd className="mt-0.5 text-sm text-ink">{fmtDateTime(result.applied_at)}</dd>
              </div>
              {result.updated_at && (
                <div>
                  <dt className="text-xs font-medium text-ink-secondary">Last updated</dt>
                  <dd className="mt-0.5 text-sm text-ink">{fmtDateTime(result.updated_at)}</dd>
                </div>
              )}
            </dl>

            <div className="mt-6 rounded-control bg-surface-muted p-4">
              <p className="text-sm font-medium text-ink">What happens next</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
                The recruiter will review your application and contact you by email if your experience matches the role.
                Keep this private link to check again.
              </p>
            </div>

            <Link
              href="/jobs"
              className="mt-6 inline-block text-[13px] font-medium text-primary underline underline-offset-4 hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              Back to open roles
            </Link>
          </Card>
        )}
      </main>
    </div>
  );
}

export default function StatusPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>
      <Tracker />
    </Suspense>
  );
}
