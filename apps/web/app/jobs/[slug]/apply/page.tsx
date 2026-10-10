"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Field, TextInput } from "../../../../components/ui";

export default function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [jobId, setJobId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [experience, setExperience] = useState("");
  const [skills, setSkills] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ applicationId: string; statusToken: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingJob, setLoadingJob] = useState(true);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
    fetch(`${base}/api/v1/jobs/${slug}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Role not found");
        const body = (await r.json()) as { data: { job_id: string } };
        setJobId(body.data.job_id);
      })
      .catch(() => setError("This role is no longer open."))
      .finally(() => setLoadingJob(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!jobId) return;
    setError("");
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
      const res = await fetch(`${base}/api/v1/recruitment/jobs/${jobId}/applications`, { method: "POST", body: form });
      if (res.status === 429) {
        setError("Too many applications right now. Try again in a minute.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "Could not submit. Check the form and try again.");
        return;
      }
      setDone(((await res.json()) as { data: { applicationId: string; statusToken: string } }).data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-pearl">
      <header className="border-b border-line-soft bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 md:px-8">
          <Link href="/jobs" className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-rausch">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-rausch text-base font-black text-white">H</span>
            HRMS
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-12 md:px-8">
        {!done ? (
          <Card className="p-6 md:p-8">
            <h1 className="text-2xl font-extrabold tracking-tight text-hof">Apply</h1>
            <p className="mt-1 text-[15px] text-foggy">Takes about two minutes. Resume optional (PDF or Word, 5 MB).</p>
            <form onSubmit={submit} className="mt-6 grid gap-4">
              <Field label="Full name">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
              </Field>
              <Field label="Email address">
                <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
              <Field label="Phone (optional)">
                <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="Years of experience">
                <TextInput inputMode="numeric" value={experience} onChange={(e) => setExperience(e.target.value)} placeholder="0" />
              </Field>
              <Field label="Key skills (comma separated)">
                <TextInput value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Node.js, Postgres" />
              </Field>
              <Field label="Resume (optional)">
                <input aria-label="Resume file" type="file" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm text-foggy" />
              </Field>
              <Button type="submit" disabled={busy} className="w-full disabled:opacity-60">
                {busy ? "Submitting…" : "Submit application"}
              </Button>
            </form>
            {error && (
              <p role="alert" className="mt-3 text-sm font-medium text-rausch-dark">
                {error}
              </p>
            )}
          </Card>
        ) : (
          <Card className="p-6 text-center md:p-8">
            <h1 className="text-2xl font-extrabold text-hof">Application received</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-foggy">Save this status token to track progress. It is shown only once.</p>
            <p className="mx-auto mt-4 max-w-full overflow-hidden text-ellipsis rounded-input bg-pearl p-4 font-mono text-sm font-semibold text-hof">{done.statusToken}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href={`/application-status?token=${done.statusToken}`} className="inline-flex h-11 items-center rounded-full bg-hof px-6 text-sm font-semibold text-white transition hover:bg-black active:scale-[0.98]">
                Track status
              </Link>
              <Link href="/jobs" className="inline-flex h-11 items-center rounded-full border border-line px-6 text-sm font-semibold text-hof transition hover:bg-pearl active:scale-[0.98]">
                More roles
              </Link>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
