"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, TextInput } from "../../components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("hr@hrms.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
      const res = await fetch(`${base}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "Login failed. Check your details and try again.");
        return;
      }
      const { data } = await res.json();
      sessionStorage.setItem("hrms_token", data.token);
      router.push("/dashboard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-pearl px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 text-2xl font-extrabold tracking-tight text-rausch">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-rausch text-base font-black text-white">H</span>
          HRMS
        </Link>
        <Card className="p-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-hof">Welcome back</h1>
          <p className="mt-1 text-[15px] text-foggy">Sign in to your workspace.</p>
          <form onSubmit={submit} className="mt-6 grid gap-4">
            <Field label="Email address">
              <TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password" error={error || undefined}>
              <TextInput
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" disabled={busy} className="mt-2 w-full disabled:opacity-60">
              {busy ? "Signing in…" : "Log in"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-foggy">
            Invited by HR? <span className="font-semibold text-hof">Use the link in your invitation email.</span>
          </p>
        </Card>
      </div>
    </div>
  );
}
