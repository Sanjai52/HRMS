"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "../../components/feedback";
import { Button, Card, Field, TextInput } from "../../components/ui";
import { requestJson } from "../../lib/api";
import { isApiError, toUserMessage } from "../../lib/errors";

interface LoginResponse {
  token: string;
  csrf: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("hr@hrms.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data } = await requestJson<LoginResponse>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      sessionStorage.setItem("hrms_token", data.token);
      sessionStorage.setItem("hrms_csrf", data.csrf);
      router.push("/dashboard");
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        // Wrong credentials: never echo the backend message (no account enumeration).
        setError({ title: "Email or password is incorrect.", body: "Check your details and try again." });
      } else {
        const userError = toUserMessage(err);
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
          <h1 className="text-2xl font-extrabold tracking-tight text-hof">Welcome back</h1>
          <p className="mt-1 text-[15px] text-foggy">Sign in to your workspace.</p>
          <form onSubmit={submit} className="mt-6 grid gap-4">
            {error && (
              <Alert tone="danger" title={error.title}>
                {error.body}
              </Alert>
            )}
            <Field label="Email address" htmlFor="login-email" required>
              <TextInput
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Password" htmlFor="login-password" required>
              <TextInput
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <div className="-mt-1 flex justify-end">
              <a
                href="/forgot-password"
                className="text-[13px] font-medium text-ink-secondary underline underline-offset-4 hover:text-ink"
              >
                Forgot password?
              </a>
            </div>
            <Button type="submit" size="lg" loading={busy} className="mt-1 w-full">
              Log in
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-foggy">
            Invited to join?{" "}
            <a href="/register" className="font-semibold text-hof underline underline-offset-4">
              Accept your invitation
            </a>
          </p>
        </Card>
      </div>
    </div>
  );
}
