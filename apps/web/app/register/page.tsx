"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "../../components/feedback";
import { Button, Card, Field, TextInput } from "../../components/ui";
import { requestJson } from "../../lib/api";
import { isApiError, toUserMessage } from "../../lib/errors";

interface AcceptResponse {
  token: string;
  csrf: string;
}

interface FormError {
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
}

function AcceptForm() {
  const router = useRouter();
  const params = useSearchParams();
  // The token travels in the URL only; it is never rendered as input text.
  const token = (params.get("token") ?? "").trim();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMismatch(false);
    if (!token) {
      setError({
        title: "Open your invitation link",
        body: "This page needs the invitation link from your email. Ask your administrator if you cannot find it.",
      });
      return;
    }
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setBusy(true);
    try {
      const { data } = await requestJson<AcceptResponse>("/api/v1/auth/accept", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      sessionStorage.setItem("hrms_token", data.token);
      sessionStorage.setItem("hrms_csrf", data.csrf);
      router.push("/dashboard");
    } catch (err) {
      if (isApiError(err) && err.status === 409) {
        setError({
          title: "That email is already registered.",
          body: "Try signing in instead.",
          actionLabel: "Sign in",
          actionHref: "/login",
        });
      } else if (isApiError(err) && (err.status === 404 || err.status === 410 || err.kind === "expired")) {
        setError({
          title: "This link has expired",
          body: "Ask your administrator for a new invitation.",
        });
      } else {
        const userError = toUserMessage(err, "We couldn't accept this invitation");
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
          <h1 className="text-2xl font-extrabold tracking-tight text-hof">Accept your invitation</h1>
          <p className="mt-1 text-[15px] text-foggy">Set a password to join your workspace.</p>
          <form onSubmit={submit} className="mt-6 grid gap-4">
            {error && (
              <Alert
                tone="danger"
                title={error.title}
                action={error.actionLabel ? { label: error.actionLabel, href: error.actionHref } : undefined}
              >
                {error.body}
              </Alert>
            )}
            {token ? (
              <div className="rounded-control border border-line bg-surface-muted px-3 py-2.5 text-[13px] leading-relaxed text-ink-secondary">
                <span className="font-medium text-ink">Invitation link ready.</span> Continue by choosing a password.
              </div>
            ) : (
              <Alert tone="warning" title="Open your invitation link">
                This page needs the invitation link from your email. Ask your administrator if you cannot find it.
              </Alert>
            )}
            <Field label="New password" htmlFor="register-password" hint="At least 8 characters." required>
              <TextInput
                id="register-password"
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
              htmlFor="register-confirm"
              error={mismatch ? "Passwords do not match." : undefined}
              required
            >
              <TextInput
                id="register-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
              />
            </Field>
            <Button type="submit" size="lg" loading={busy} disabled={!token} className="mt-1 w-full">
              Join workspace
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <AcceptForm />
    </Suspense>
  );
}
