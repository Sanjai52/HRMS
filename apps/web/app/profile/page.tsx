"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../components/app-shell";
import { Button, Card, Field, TextInput, StatusPill, SkeletonRows } from "../../components/ui";
import { authed } from "../../lib/hr";

interface Me {
  employee_id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  status: string;
  version: number;
}

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  async function load() {
    try {
      const data = await authed<Me | null>("/api/v1/employees/me");
      if (!data) {
        setState("error");
        return;
      }
      setMe(data);
      setName(data.name);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <AppShell title="My profile">
      {state === "loading" && <SkeletonRows n={3} />}
      {state === "error" && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">No profile yet</p>
          <p className="mt-1 text-sm text-foggy">Your HR team creates your record after you accept an invitation.</p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-hof underline underline-offset-4">
            Back to dashboard
          </Link>
        </Card>
      )}
      {state === "ready" && me && (
        <div className="grid max-w-2xl gap-6">
          <Card className="flex flex-wrap items-center gap-4 p-6">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-rausch/10 text-lg font-extrabold text-rausch-dark">
              {me.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-extrabold text-hof">{me.name}</p>
              <p className="truncate text-sm text-foggy">{me.designation} · {me.department}</p>
            </div>
            <StatusPill status={me.status} />
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-bold text-hof">Personal details</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setNotice("");
                try {
                  const data = await authed<Me>("/api/v1/employees/me", undefined, { method: "PATCH", body: JSON.stringify({ name, version: me.version }) });
                  setMe(data);
                  setNotice("Profile updated.");
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
              className="mt-4 grid gap-4"
            >
              <Field label="Full name">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
              </Field>
              <Field label="Email address">
                <TextInput value={me.email} disabled aria-label="Email address (managed by HR)" />
              </Field>
              <Button type="submit" className="w-full">Save changes</Button>
            </form>
            {notice && <p className="mt-3 text-sm font-medium text-babu">{notice}</p>}
            {error && (
              <p role="alert" className="mt-3 text-sm font-medium text-rausch-dark">
                {error}
              </p>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
