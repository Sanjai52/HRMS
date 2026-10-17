"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

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
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 429) {
        setError("Too many attempts. Wait a minute and try again.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "Login failed. Check your details and try again.");
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
        <div className="rounded-card border border-line-soft bg-white p-8 shadow-card">
          <h1 className="text-2xl font-extrabold tracking-tight text-hof">Welcome back</h1>
          <p className="mt-1 text-[15px] text-foggy">Sign in to your workspace.</p>
          <form onSubmit={submit} className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="font-semibold text-hof">Email address</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 rounded-input border border-line bg-white px-4 text-[15px] text-hof outline-none placeholder:text-foggy/70 focus:border-hof"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="flex items-center justify-between font-semibold text-hof">
                Password
                <a href="/forgot-password" className="font-medium text-foggy underline underline-offset-4 hover:text-hof">
                  Forgot password?
                </a>
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 rounded-input border border-line bg-white px-4 text-[15px] text-hof outline-none placeholder:text-foggy/70 focus:border-hof"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm font-medium text-rausch-dark">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="mt-2 inline-flex h-12 items-center justify-center rounded-full bg-rausch px-6 text-[15px] font-semibold text-white transition hover:bg-rausch-dark active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Log in"}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-foggy">
            Invited to join? <a href="/register" className="font-semibold text-hof underline underline-offset-4">Accept your invitation</a>
          </p>
        </div>
      </div>
    </div>
  );
}
