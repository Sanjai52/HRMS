"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, Field, TextInput } from "../../components/ui";

function ResetForm() {
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
      const res = await fetch(`${base}/api/v1/auth/reset-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: token.trim(), password }),
      });
      if (res.status === 410) {
        setError("This reset link is invalid or has expired. Request a new one.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "Could not reset the password. Check the link and try again.");
        return;
      }
      setDone(true);
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
          {done ? (
            <div className="grid gap-3 text-center">
              <h1 className="text-2xl font-extrabold tracking-tight text-hof">Password updated</h1>
              <p className="text-[15px] leading-relaxed text-foggy">Your new password is active. Sign in to continue.</p>
              <a href="/login" className="text-sm font-semibold text-hof underline underline-offset-4">
                Go to login
              </a>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold tracking-tight text-hof">Choose a new password</h1>
              <p className="mt-1 text-[15px] text-foggy">Paste your reset token and pick a password of at least 8 characters.</p>
              <form onSubmit={submit} className="mt-6 grid gap-4">
                <Field label="Reset token">
                  <TextInput value={token} onChange={(e) => setToken(e.target.value)} placeholder="From your reset email" required />
                </Field>
                <Field label="New password">
                  <TextInput
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </Field>
                <Field label="Confirm password" error={error || undefined}>
                  <TextInput
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                  />
                </Field>
                <Button type="submit" disabled={busy} className="mt-2 w-full disabled:opacity-60">
                  {busy ? "Updating…" : "Update password"}
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
