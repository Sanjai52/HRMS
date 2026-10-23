"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../../../components/app-shell";
import { Alert } from "../../../../../components/feedback";
import { Button, Card, Field, TextInput } from "../../../../../components/ui";
import { authed } from "../../../../../lib/hr";
import { toUserMessage } from "../../../../../lib/errors";

interface SafeMessage {
  title: string;
  body: string;
}

type CopyState = "idle" | "copied" | "failed";
type ShortLinkState = "idle" | "pending" | "ready" | "failed";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2";

export default function NewJobPage() {
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("Engineering");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<SafeMessage | null>(null);
  const [busy, setBusy] = useState(false);
  // The short link and slug exist in state for the clipboard action and the
  // public-page href only. Neither is rendered as text.
  const [shortUrl, setShortUrl] = useState("");
  const [shortLinkState, setShortLinkState] = useState<ShortLinkState>("idle");
  const [slug, setSlug] = useState("");
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function copyApplicationLink() {
    if (!shortUrl) return;
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(shortUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <AppShell title="New opening">
      <div className="grid max-w-3xl gap-6">
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-ink">Publish a job posting</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
            It appears on the public careers page right away.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setShortUrl("");
              setShortLinkState("idle");
              setSlug("");
              setCopyState("idle");
              setBusy(true);
              try {
                const published = await authed<{ slug: string }>("/api/v1/jobs", undefined, {
                  method: "POST",
                  body: JSON.stringify({ title, department, location, description }),
                });
                // The opening is live now. Show success immediately so a
                // short-link failure can never be mistaken for a failed
                // publish and prompt HR to create a duplicate.
                setSlug(published.slug);
                setTitle("");
                setDescription("");
                setShortLinkState("pending");

                // Best-effort convenience link. If it fails, the published
                // opening stays visible with the public-page action.
                try {
                  const short = await authed<{ code: string }>("/api/v1/short-urls", undefined, {
                    method: "POST",
                    body: JSON.stringify({ destination: `/jobs/${published.slug}` }),
                  });
                  // The short-link route is served by the API, so the configured
                  // public origin wins, then the API origin, then the current host.
                  const origin =
                    process.env.NEXT_PUBLIC_PUBLIC_ORIGIN ??
                    process.env.NEXT_PUBLIC_API_BASE ??
                    "http://localhost:4000";
                  setShortUrl(`${origin.replace(/\/+$/, "")}/s/${short.code}`);
                  setShortLinkState("ready");
                } catch {
                  setShortLinkState("failed");
                }
              } catch (err) {
                const message = toUserMessage(err, "We couldn't publish this opening");
                setError({ title: message.title, body: message.body });
              } finally {
                setBusy(false);
              }
            }}
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <Field label="Job title" htmlFor="job-title" required>
              <TextInput id="job-title" value={title} onChange={(e) => setTitle(e.target.value)} minLength={3} />
            </Field>
            <Field label="Department" htmlFor="job-department">
              <TextInput id="job-department" value={department} onChange={(e) => setDepartment(e.target.value)} />
            </Field>
            <Field label="Location" htmlFor="job-location">
              <TextInput
                id="job-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Chennai"
              />
            </Field>
            <Field label="Description" htmlFor="job-description">
              <TextInput
                id="job-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What the role owns"
              />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" loading={busy} className="w-full">
                Publish opening
              </Button>
            </div>
          </form>

          {error && (
            <div className="mt-4">
              <Alert tone="danger" title={error.title}>
                {error.body}
              </Alert>
            </div>
          )}

          {slug && (
            <div className="mt-5 rounded-card border border-success/20 bg-success-soft p-4">
              <div role="status" aria-live="polite">
                <p className="text-sm font-semibold text-success">Opening published.</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
                  {shortLinkState === "failed"
                    ? "The opening is live. Open the public page and copy the address from your browser."
                    : "Share this application link with candidates."}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {shortLinkState !== "failed" && shortLinkState !== "idle" && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={copyApplicationLink}
                    disabled={shortLinkState !== "ready"}
                  >
                    Copy application link
                  </Button>
                )}
                <Link
                  href={`/jobs/${slug}`}
                  className={`inline-flex h-8 items-center rounded-control border border-line bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-surface-muted ${focusRing}`}
                >
                  View public page
                </Link>
              </div>
              {copyState === "copied" && (
                <p role="status" className="mt-2 text-[13px] font-medium text-success">
                  Application link copied.
                </p>
              )}
              {copyState === "failed" && (
                <p role="status" className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
                  We couldn&apos;t copy the link. Open the public page and copy the address from your browser.
                </p>
              )}
            </div>
          )}
        </Card>

        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-[13px] text-ink-secondary">Manage everything you have published so far.</p>
          <Link
            href="/hr/recruitment/jobs"
            className={`inline-flex h-9 shrink-0 items-center rounded-control border border-line bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-muted ${focusRing}`}
          >
            Job postings
          </Link>
        </Card>
      </div>
    </AppShell>
  );
}
