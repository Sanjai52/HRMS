"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../components/app-shell";
import { Alert, ErrorState } from "../../components/feedback";
import { Button, Card, Field, TextInput, StatusPill, SkeletonRows } from "../../components/ui";
import { toUserMessage, type UserError } from "../../lib/errors";
import { employeeLabel, initials } from "../../lib/format";
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
  const [saveError, setSaveError] = useState<UserError | null>(null);
  const [notice, setNotice] = useState("");
  const [state, setState] = useState<"loading" | "empty" | "error" | "ready">("loading");
  const [pageError, setPageError] = useState<UserError | null>(null);

  async function load() {
    setState("loading");
    setPageError(null);
    try {
      const data = await authed<Me | null>("/api/v1/employees/me");
      if (!data) {
        setMe(null);
        setState("empty");
        return;
      }
      setMe(data);
      setName(data.name);
      setState("ready");
    } catch (err) {
      setPageError(toUserMessage(err, "We couldn't load your profile"));
      setState("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="My profile">
      {state === "loading" && <SkeletonRows n={3} />}
      {state === "empty" && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-hof">No profile yet</p>
          <p className="mt-1 text-sm text-foggy">Your HR team creates your record after you accept an invitation.</p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-hof underline underline-offset-4">
            Back to dashboard
          </Link>
        </Card>
      )}
      {state === "error" && pageError && (
        <ErrorState
          title={pageError.title}
          body={pageError.body}
          actionLabel={pageError.actionLabel}
          actionHref={pageError.action === "signin" ? "/login" : pageError.action === "back" ? "/dashboard" : undefined}
          onAction={pageError.action === "signin" || pageError.action === "back" ? undefined : () => void load()}
        />
      )}
      {state === "ready" && me && (
        <div className="grid max-w-2xl gap-6">
          <Card className="flex flex-wrap items-center gap-4 p-6">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-lg font-extrabold text-primary-ink">
              {initials(me.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-extrabold text-hof">{employeeLabel(me)}</p>
              <p className="truncate text-sm text-foggy">{me.designation} · {me.department}</p>
            </div>
            <StatusPill status={me.status} />
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-bold text-hof">Personal details</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSaveError(null);
                setNotice("");
                try {
                  const data = await authed<{ name: string; version: number }>("/api/v1/employees/me", undefined, { method: "PATCH", body: JSON.stringify({ name, version: me.version }) });
                  // PATCH returns shard-row fields; the directory read model is projected
                  // asynchronously by the dispatcher. Merge the authoritative name/version
                  // instead of replacing the read model so department/designation/status
                  // survive the save.
                  setMe((prev) => (prev ? { ...prev, name: data.name, version: data.version } : prev));
                  setName(data.name);
                  setNotice("Profile updated.");
                } catch (err) {
                  setSaveError(toUserMessage(err, "We couldn't save your profile"));
                }
              }}
              className="mt-4 grid gap-4"
            >
              <Field label="Full name">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
              </Field>
              <Field label="Email address" hint="Contact your administrator to change your email.">
                <TextInput value={me.email} disabled aria-label="Email address (managed by HR)" />
              </Field>
              <Button type="submit" className="w-full">Save changes</Button>
            </form>
            {notice && (
              <div className="mt-3">
                <Alert tone="success">{notice}</Alert>
              </div>
            )}
            {saveError && (
              <div className="mt-3">
                <Alert tone="danger" title={saveError.title}>
                  {saveError.body}
                </Alert>
              </div>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
