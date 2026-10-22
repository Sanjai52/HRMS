"use client";
import { useState } from "react";
import { Alert } from "./feedback";
import { toUserMessage, type UserError } from "../lib/errors";
import { authed } from "../lib/hr";

export interface DecisionTarget {
  request_id: string;
  version: number;
  status: string;
}

export function DecisionButtons({ target, onDone, allowOverride }: { target: DecisionTarget; onDone: () => void; allowOverride?: boolean }) {
  const [error, setError] = useState<UserError | null>(null);
  const [busy, setBusy] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [reason, setReason] = useState("");

  async function act(path: string, body: object) {
    setBusy(true);
    setError(null);
    try {
      await authed(`/api/v1/leave/requests/${target.request_id}/${path}`, undefined, { method: "POST", body: JSON.stringify(body) });
      onDone();
    } catch (err) {
      setError(toUserMessage(err, "We couldn't record this decision"));
    } finally {
      setBusy(false);
    }
  }

  const pending = target.status === "PENDING_MANAGER" || target.status === "PENDING_HR";
  return (
    <div>
      <div className="flex gap-2">
        {pending && (
          <>
            <button disabled={busy} onClick={() => act("approve", { version: target.version })} className="h-9 rounded-full bg-success px-4 text-[13px] font-semibold text-white transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50">
              Approve
            </button>
            <button disabled={busy} onClick={() => act("reject", { version: target.version })} className="h-9 rounded-full border border-line px-4 text-[13px] font-semibold text-hof transition hover:bg-pearl active:scale-[0.98] disabled:opacity-50">
              Reject
            </button>
          </>
        )}
        {allowOverride && target.status === "REJECTED" && !overriding && (
          <button disabled={busy} onClick={() => setOverriding(true)} className="h-9 rounded-full border border-warning px-4 text-[13px] font-semibold text-warning transition hover:bg-warning-soft active:scale-[0.98] disabled:opacity-50">
            Override
          </button>
        )}
      </div>
      {overriding && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act("override", { version: target.version, reason });
          }}
        >
          <input aria-label="Override reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Written reason (required)" required className="h-9 min-w-0 flex-1 rounded-input border border-line px-3 text-[13px] outline-none focus:border-hof" />
          <button type="submit" disabled={busy} className="h-9 shrink-0 rounded-full bg-warning px-4 text-[13px] font-semibold text-white disabled:opacity-50">
            Confirm
          </button>
        </form>
      )}
      {error && (
        <Alert
          tone="danger"
          title={error.title}
          className="mt-2"
          action={{
            label: "Refresh",
            onClick: () => {
              setError(null);
              onDone();
            },
          }}
        >
          {error.body}
        </Alert>
      )}
    </div>
  );
}
