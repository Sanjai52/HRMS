"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../../components/app-shell";
import { Button, Card, Field, TextInput, SkeletonRows, StatusPill } from "../../../../components/ui";
import { authed } from "../../../../lib/hr";

interface Job {
  job_id: string;
  slug: string;
  title: string;
  department: string;
  location: string;
  status: string;
}

export default function JobsPage() {
  const [rows, setRows] = useState<Job[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("Engineering");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [short, setShort] = useState("");

  async function load() {
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
      const res = await fetch(`${base}/api/v1/jobs`);
      if (!res.ok) throw new Error("Load failed");
      const body = (await res.json()) as { data: Job[] };
      setRows(body.data);
      setState("ready");
    } catch {
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
        <Card className="p-6">
          <h2 className="text-lg font-bold text-hof">New opening</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setShort("");
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
                setTitle("");
                setDescription("");
                await load();
              } catch (err) {
                setError((err as Error).message);
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
              <Button type="submit" className="w-full">Publish opening</Button>
            </div>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-rausch-dark">
              {error}
            </p>
          )}
          {short && (
            <p className="mt-3 text-sm text-hof">
              Shareable link: <span className="font-mono font-semibold">{short}</span>
            </p>
          )}
        </Card>
        <Card className="divide-y divide-line-soft">
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-foggy">No open roles.</p>}
          {rows.map((j) => (
            <div key={j.job_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-hof">{j.title}</p>
                <p className="truncate text-sm text-foggy">{j.department} · {j.location}</p>
              </div>
              <StatusPill status={j.status} />
              <Link href={`/jobs/${j.slug}`} className="text-sm font-semibold text-hof underline underline-offset-4">
                Public page
              </Link>
            </div>
          ))}
        </Card>
      </div>
    </AppShell>
  );
}
