"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert } from "../../components/feedback";
import { Button, Card, Field, TextInput } from "../../components/ui";
import { requestJson } from "../../lib/api";
import { isApiError, toUserMessage } from "../../lib/errors";

function ResetForm() {
  const params = useSearchParams();
  // The reset token travels in the URL only; it is never rendered.
  const token = (params.get("token") ?? "").trim();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const linkExpired = expired || !token;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMismatch(false);
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setBusy(true);
    try {
      await requestJson("/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (err) {
      if (isApiError(err) && (err.status === 404 || err.status === 410 || err.kind === "expired")) {
        setExpired(true);
      } else {
        const userError = toUserMessage(err, "We couldn't reset your password");
        setError({ title: userError.title, body: userError.body });
      }
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
          {done ? (
            <div className="grid gap-4">
              <Alert tone="success" title="Password updated">
                Your new password is active. Sign in to continue.
              </Alert>
              <p className="text-center text-sm text-foggy">
                <a href="/login" className="font-semibold text-hof underline underline-offset-4">
                  Go to sign in
                </a>
              </p>
            </div>
          ) : linkExpired ? (
            <div className="grid gap-4">
              <Alert
                tone="danger"
                title="This link has expired"
                action={{ label: "Request a new link", href: "/forgot-password" }}
              >
                Ask the sender for a new link.
              </Alert>
              <p className="text-center text-sm text-foggy">
                <a href="/login" className="font-semibold text-hof underline underline-offset-4">
                  Back to sign in
                </a>
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold tracking-tight text-hof">Choose a new password</h1>
              <p className="mt-1 text-[15px] text-foggy">Pick a password of at least 8 characters.</p>
              <form onSubmit={submit} className="mt-6 grid gap-4">
                {error && (
                  <Alert tone="danger" title={error.title}>
                    {error.body}
                  </Alert>
                )}
                <div className="rounded-control border border-line bg-surface-muted px-3 py-2.5 text-[13px] leading-relaxed text-ink-secondary">
                  <span className="font-medium text-ink">Reset link ready.</span> Choose a new password below.
                </div>
                <Field label="New password" htmlFor="reset-password" hint="At least 8 characters." required>
                  <TextInput
                    id="reset-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </Field>
                <Field
                  label="Confirm password"
                  htmlFor="reset-confirm"
                  error={mismatch ? "Passwords do not match." : undefined}
                  required
                >
                  <TextInput
                    id="reset-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                  />
                </Field>
                <Button type="submit" size="lg" loading={busy} className="mt-1 w-full">
                  Update password
                </Button>
              </form>
              <p className="mt-4 text-center text-sm text-foggy">
                Need a new link?{" "}
                <a href="/forgot-password" className="font-semibold text-hof underline underline-offset-4">
                  Request one
                </a>
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
