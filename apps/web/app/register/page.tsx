"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Field, TextInput } from "../../components/ui";

function AcceptForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
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
      const res = await fetch(`${base}/api/v1/auth/accept`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: token.trim(), password }),
      });
      if (res.status === 410) {
        setError("This invitation has expired. Ask your HR team for a new one.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "Could not accept this invitation. Check the link and try again.");
        return;
      }
      const { data } = await res.json();
      sessionStorage.setItem("hrms_token", data.token);
      sessionStorage.setItem("hrms_csrf", data.csrf);
      router.push("/dashboard");
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
          <h1 className="text-2xl font-extrabold tracking-tight text-hof">Accept your invitation</h1>
          <p className="mt-1 text-[15px] text-foggy">Paste your invitation token and set a password to join.</p>
          <form onSubmit={submit} className="mt-6 grid gap-4">
            <Field label="Invitation token">
              <TextInput value={token} onChange={(e) => setToken(e.target.value)} placeholder="From your invitation email" required />
            </Field>
            <Field label="New password">
              <TextInput type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </Field>
            <Field label="Confirm password" error={error || undefined}>
              <TextInput type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
            </Field>
            <Button type="submit" disabled={busy} className="mt-2 w-full disabled:opacity-60">
              {busy ? "Joining…" : "Join workspace"}
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
