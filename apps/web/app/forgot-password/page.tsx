"use client";
import { useState } from "react";
import { Button, Card, Field, TextInput } from "../../components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
      const res = await fetch(`${base}/api/v1/auth/forgot-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        setError("Too many requests. Wait a minute and try again.");
        return;
      }
      if (!res.ok) {
        setError("Could not send the reset link. Try again shortly.");
        return;
      }
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-pearl px-4">
      <div className="w-full max-w-md">
        <p className="mb-6 flex items-center justify-center gap-2 text-2xl font-extrabold tracking-tight text-rausch">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-rausch text-base font-black text-white">H</span>
          HRMS
        </p>
        <Card className="p-8">
          {sent ? (
            <div className="grid gap-3 text-center">
              <h1 className="text-2xl font-extrabold tracking-tight text-hof">Check your inbox</h1>
              <p className="text-[15px] leading-relaxed text-foggy">
                If an account exists for <span className="font-semibold text-hof">{email}</span>, we have sent a reset link.
                It stays valid for 30 minutes.
              </p>
              <a href="/login" className="text-sm font-semibold text-hof underline underline-offset-4">
                Back to login
              </a>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold tracking-tight text-hof">Forgot your password?</h1>
              <p className="mt-1 text-[15px] text-foggy">Enter your work email and we will send you a reset link.</p>
              <form onSubmit={submit} className="mt-6 grid gap-4">
                <Field label="Email address" error={error || undefined}>
                  <TextInput
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                  />
                </Field>
                <Button type="submit" disabled={busy} className="mt-2 w-full disabled:opacity-60">
                  {busy ? "Sending…" : "Send reset link"}
                </Button>
              </form>
              <p className="mt-4 text-center text-sm text-foggy">
                Remembered it?{" "}
                <a href="/login" className="font-semibold text-hof underline underline-offset-4">
                  Log in
                </a>
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
