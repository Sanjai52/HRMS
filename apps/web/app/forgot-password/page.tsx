"use client";
import { useState } from "react";
import { Alert } from "../../components/feedback";
import { Button, Card, Field, TextInput } from "../../components/ui";
import { requestJson } from "../../lib/api";
import { toUserMessage } from "../../lib/errors";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await requestJson("/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      const userError = toUserMessage(err, "We couldn't send the reset link");
      setError({ title: userError.title, body: userError.body });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-pearl px-4">
      <div className="w-full max-w-md">
        <p className="mb-6 flex items-center justify-center gap-2 text-2xl font-extrabold tracking-tight text-brand">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-base font-black text-white">H</span>
          HRMS
        </p>
        <Card className="p-8">
          {sent ? (
            <div className="grid gap-4">
              <Alert tone="success" title="Check your inbox">
                If an account exists for that email, we&apos;ve sent a reset link. It stays valid for 30 minutes.
              </Alert>
              <p className="text-center text-sm text-foggy">
                <a href="/login" className="font-semibold text-hof underline underline-offset-4">
                  Back to sign in
                </a>
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold tracking-tight text-hof">Forgot your password?</h1>
              <p className="mt-1 text-[15px] text-foggy">Enter your work email and we will send you a reset link.</p>
              <form onSubmit={submit} className="mt-6 grid gap-4">
                {error && (
                  <Alert tone="danger" title={error.title}>
                    {error.body}
                  </Alert>
                )}
                <Field label="Email address" htmlFor="forgot-email" required>
                  <TextInput
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                  />
                </Field>
                <Button type="submit" size="lg" loading={busy} className="mt-1 w-full">
                  Send reset link
                </Button>
              </form>
              <p className="mt-4 text-center text-sm text-foggy">
                Remembered it?{" "}
                <a href="/login" className="font-semibold text-hof underline underline-offset-4">
                  Sign in
                </a>
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
