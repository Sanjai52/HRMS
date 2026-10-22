"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../../../components/app-shell";
import { Alert, ErrorState, LoadingState } from "../../../../../components/feedback";
import { Card, EmptyState, StatusPill } from "../../../../../components/ui";
import { authed } from "../../../../../lib/hr";
import { toUserMessage } from "../../../../../lib/errors";
import { safeHttpUrl } from "../../../../../lib/format";

interface RunDetail {
  run: {
    role: string;
    skills: string[] | null;
    status: string;
    pages: number;
    discovered: number;
    imported: number;
    errors: number;
  };
  pages: Array<{ url: string; status: number }>;
}

interface SafeMessage {
  title: string;
  body: string;
}

const TERMINAL_STATUSES = ["COMPLETED", "PARTIAL_FAILED", "FAILED"];
const POLL_INTERVAL_MS = 3000;

function safeSourceHref(value: string): { href: string; host: string } | null {
  const safe = safeHttpUrl(value);
  if (!safe) return null;
  try {
    const url = new URL(safe);
    // Query strings and fragments can carry tokens; the source link only
    // needs the page itself.
    url.search = "";
    url.hash = "";
    return { href: url.toString(), host: url.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<RunDetail | null>(null);
  const [error, setError] = useState<SafeMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const data = await authed<RunDetail>(`/api/v1/recruitment/sourcing/runs/${id}`);
        if (cancelled) return;
        setD(data);
        setLoading(false);
        if (!TERMINAL_STATUSES.includes(data.run.status)) {
          timer = setTimeout(() => void load(), POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        // Stop polling on failure and surface a safe message instead of a
        // forever skeleton. Any previously loaded rows stay visible.
        const message = toUserMessage(err, "We couldn't load this sourcing run");
        setError({ title: message.title, body: message.body });
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, attempt]);

  const terminal = d ? TERMINAL_STATUSES.includes(d.run.status) : false;

  return (
    <AppShell title="Sourcing run">
      {loading && !d && <LoadingState rows={3} />}

      {!loading && !d && error && (
        <ErrorState
          title={error.title}
          body={error.body}
          actionLabel="Try again"
          onAction={() => setAttempt((n) => n + 1)}
          secondaryLabel="Back to sourcing"
          secondaryHref="/hr/recruitment/sourcing"
        />
      )}

      {d && (
        <div className="grid max-w-3xl gap-6">
          {error && (
            <Alert
              tone="danger"
              title={error.title}
              action={{ label: "Try again", onClick: () => setAttempt((n) => n + 1) }}
            >
              {error.body}
            </Alert>
          )}

          <Card className="flex flex-wrap items-center gap-4 p-6">
            <div className="min-w-0 flex-1">
              <p className="text-xl font-semibold tracking-[-0.01em] text-ink">{d.run.role?.trim() || "General sourcing"}</p>
              <p className="text-[13px] text-ink-secondary">{(d.run.skills ?? []).join(", ") || "No skill filter"}</p>
              <p className="mt-1 text-[13px] text-ink-secondary">
                {d.run.pages} pages checked · {d.run.discovered} candidates found · {d.run.imported} imported
                {d.run.errors > 0 &&
                  ` · ${d.run.errors} ${d.run.errors === 1 ? "page" : "pages"} couldn't be read`}
              </p>
            </div>
            <StatusPill status={d.run.status} />
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">Pages checked</h2>
              {!terminal && !error && (
                <p role="status" className="text-xs text-ink-secondary">
                  Checking for updates…
                </p>
              )}
            </div>

            {d.pages.length === 0 ? (
              <EmptyState
                className="border-0 bg-transparent shadow-none"
                title="No pages checked yet"
                body="Pages will appear here as the run progresses."
              />
            ) : (
              <ul className="divide-y divide-line-soft">
                {d.pages.map(({ url, status }, index) => {
                  const source = safeSourceHref(url);
                  const host = source?.host ?? "";
                  const ok = status >= 200 && status < 300;
                  return (
                    <li key={`${index}-${url}`} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        {source ? (
                          <a
                            href={source.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`View source page ${index + 1}${host ? ` on ${host}` : ""}`}
                            className="text-[13px] font-medium text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                          >
                            Source page {index + 1}
                          </a>
                        ) : (
                          <span className="text-[13px] font-medium text-ink-secondary">Source page {index + 1}</span>
                        )}
                        {host && <p className="mt-0.5 truncate text-xs text-ink-secondary">{host}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        {ok ? (
                          <StatusPill status="Visited" tone="success" />
                        ) : (
                          <>
                            <StatusPill status="FAILED" />
                            <p className="mt-1 text-xs font-medium text-ink">Couldn&apos;t load this page</p>
                            <p className="text-xs text-ink-secondary">The source page did not respond.</p>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Link
            href="/hr/recruitment/candidates"
            className="text-[13px] font-medium text-primary underline underline-offset-4 hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            Open candidate pool
          </Link>
        </div>
      )}
    </AppShell>
  );
}
