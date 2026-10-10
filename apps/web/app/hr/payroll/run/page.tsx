"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../../components/app-shell";
import { Button, Card, Field, TextInput } from "../../../../components/ui";
import { authed } from "../../../../lib/hr";

export default function RunPayrollPage() {
  const router = useRouter();
  const [period, setPeriod] = useState("2026-09");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await authed<{ batchId: string }>("/api/v1/payroll/batches", undefined, {
        method: "POST",
        body: JSON.stringify({ period }),
      });
      router.push(`/hr/payroll/batches/${data.batchId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Run payroll">
      <Card className="max-w-xl p-6">
        <p className="text-sm leading-relaxed text-foggy">
          Queues one job per shard. Progress appears on the batch page; employees are notified when their payslip is ready.
        </p>
        <form onSubmit={submit} className="mt-4 grid gap-4">
          <Field label="Pay period">
            <TextInput value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="YYYY-MM" pattern="\d{4}-(0[1-9]|1[0-2])" required />
          </Field>
          <Button type="submit" disabled={busy} className="w-full disabled:opacity-60">
            {busy ? "Queueing…" : "Queue payroll run"}
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-rausch-dark">
            {error}
          </p>
        )}
      </Card>
    </AppShell>
  );
}
