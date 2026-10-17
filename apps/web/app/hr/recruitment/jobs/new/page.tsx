"use client";
import { useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../../../components/app-shell";
import { Button, Card, Field, TextInput } from "../../../../../components/ui";
import { authed } from "../../../../../lib/hr";

export default function NewJobPage() {
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("Engineering");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [short, setShort] = useState("");
  const [slug, setSlug] = useState("");

  return (
    <AppShell title="New opening">
      <div className="grid max-w-3xl gap-6">
        <Card className="p-6">
          <h2 className="text-lg font-bold text-hof">Publish a job posting</h2>
          <p className="mt-1 text-sm text-foggy">It appears on the public careers page right away.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setShort("");
              setBusy(true);
              try {
                const j = await authed<{ jobId: string; slug: string }>("/api/v1/jobs", undefined, {
                  method: "POST",
                  body: JSON.stringify({ title, department, location, description }),
                });
                const s = await authed<{ code: string }>("/api/v1/short-urls", undefined, {
                  method: "POST",
                  body: JSON.stringify({ destination: `/jobs/${j.slug}` }),
                });
                const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
                setShort(`${base}/s/${s.code}`);
                setSlug(j.slug);
                setTitle("");
                setDescription("");
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <Field label="Job title">
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
            </Field>
            <Field label="Department">
              <TextInput value={department} onChange={(e) => setDepartment(e.target.value)} />
            </Field>
            <Field label="Location">
              <TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Chennai" />
            </Field>
            <Field label="Description">
              <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the role owns" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy} className="w-full disabled:opacity-60">
                {busy ? "Publishing…" : "Publish opening"}
              </Button>
            </div>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-rausch-dark">
              {error}
            </p>
          )}
          {short && (
            <div role="status" className="mt-4 rounded-card border border-babu/30 bg-babu/10 px-4 py-3 text-sm text-hof">
              <p className="font-medium">Opening published. Shareable link:</p>
              <p className="mt-1 font-mono font-semibold">{short}</p>
              <Link href={`/jobs/${slug}`} className="mt-2 inline-block font-semibold text-hof underline underline-offset-4">
                View public page
              </Link>
            </div>
          )}
        </Card>
        <Card className="flex items-center justify-between gap-3 p-5">
          <p className="text-sm text-foggy">Manage everything you have published so far.</p>
          <Link
            href="/hr/recruitment/jobs"
            className="inline-flex h-11 shrink-0 items-center rounded-full border border-line px-5 text-sm font-semibold text-hof transition hover:bg-pearl active:scale-[0.98]"
          >
            Job postings
          </Link>
        </Card>
      </div>
    </AppShell>
  );
}
