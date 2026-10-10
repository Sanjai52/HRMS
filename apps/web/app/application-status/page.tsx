"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card, Field, TextInput, StatusPill } from "../../components/ui";

function Tracker() {
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [result, setResult] = useState<{ jobTitle: string; stage: string; applied_at: string } | null>(null);
  const [error, setError] = useState("");

  async function check(t: string) {
    setError("");
    setResult(null);
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
    const res = await fetch(`${base}/api/v1/recruitment/application-status/${t.trim()}`);
    if (res.status === 410) {
      setError("This status link has expired.");
      return;
    }
    if (!res.ok) {
      setError("Unknown status link. Check the token and try again.");
      return;
    }
    setResult(((await res.json()) as { data: { jobTitle: string; stage: string; applied_at: string } }).data);
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
        <Card className="p-6 md:p-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-hof">Track your application</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              check(token);
            }}
            className="mt-6 grid gap-4"
          >
            <Field label="Status token">
              <TextInput value={token} onChange={(e) => setToken(e.target.value)} placeholder="From your confirmation screen" required />
            </Field>
            <Button type="submit" className="w-full">Check status</Button>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-rausch-dark">
              {error}
            </p>
          )}
          {result && (
            <div className="mt-6 rounded-card bg-pearl p-5 text-center">
              <p className="text-sm text-foggy">{result.jobTitle}</p>
              <p className="mt-2"><StatusPill status={result.stage} /></p>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

export default function StatusPage() {
  return (
    <Suspense>
      <Tracker />
    </Suspense>
  );
}
