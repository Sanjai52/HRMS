"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/app-shell";
import { Alert } from "../../../components/feedback";
import { Button, Card, Field, TextInput } from "../../../components/ui";
import { toUserMessage, type UserError } from "../../../lib/errors";
import { authed } from "../../../lib/hr";

export default function ApplyLeavePage() {
  const router = useRouter();
  const [type, setType] = useState("CASUAL");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<UserError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await authed("/api/v1/leave/requests", undefined, {
        method: "POST",
        body: JSON.stringify({ type, start, end, reason }),
      });
      router.push("/leave");
    } catch (err) {
      setError(toUserMessage(err, "We couldn't submit your request"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Apply for leave">
      <Card className="max-w-xl p-6">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Leave type">
            <select aria-label="Leave type" value={type} onChange={(e) => setType(e.target.value)} className="h-12 rounded-input border border-line bg-white px-3 text-[15px] text-hof outline-none focus:border-hof">
              <option value="CASUAL">Casual</option>
              <option value="SICK">Sick</option>
              <option value="EARNED">Earned</option>
            </select>
          </Field>
          <Field label="Reason">
            <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Brief reason" />
          </Field>
          <Field label="Start date">
            <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
          </Field>
          <Field label="End date">
            <TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy} className="w-full disabled:opacity-60">
              {busy ? "Submitting…" : "Submit request"}
            </Button>
          </div>
        </form>
        {error && (
          <div className="mt-3">
            <Alert tone="danger" title={error.title}>
              {error.body}
            </Alert>
          </div>
        )}
        <p className="mt-3 text-[13px] text-foggy">Weekends and public holidays are not counted. Requests stay within one year.</p>
      </Card>
    </AppShell>
  );
}
