"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { ErrorState } from "../../components/feedback";
import { Card, SkeletonRows } from "../../components/ui";
import { toUserMessage, type UserError } from "../../lib/errors";
import { authed } from "../../lib/hr";

interface Goal {
  goal_id: string;
  title: string;
  target: string;
  progress: number;
  status: string;
}

interface Review {
  review_id: string;
  cycle_id: string;
  rating: number;
  feedback: string;
  strengths: string;
  improvements: string;
}

export default function MyPerformancePage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<UserError | null>(null);

  async function load() {
    setState("loading");
    setError(null);
    try {
      const [g, r] = await Promise.all([
        authed<Goal[]>("/api/v1/performance/goals"),
        authed<Review[]>("/api/v1/performance/reviews/me"),
      ]);
      setGoals(g);
      setReviews(r);
      setState("ready");
    } catch (err) {
      setError(toUserMessage(err, "We couldn't load your performance"));
      setState("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="My performance">
      {state === "loading" && <SkeletonRows n={4} />}
      {state === "error" && error && (
        <ErrorState
          title={error.title}
          body={error.body}
          actionLabel={error.actionLabel}
          actionHref={error.action === "signin" ? "/login" : error.action === "back" ? "/dashboard" : undefined}
          onAction={error.action === "signin" || error.action === "back" ? undefined : () => void load()}
        />
      )}
      {state === "ready" && (
        <div className="grid max-w-3xl gap-6">
          <Card className="p-6">
            <h2 className="text-balance text-lg font-semibold text-hof">My goals</h2>
            {goals.length === 0 && <p className="mt-2 text-sm text-foggy">No goals set yet. Your manager will add them each cycle.</p>}
            <ul className="mt-3 grid gap-4">
              {goals.map((g) => (
                <li key={g.goal_id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[15px] font-semibold text-hof">{g.title}</p>
                    <span className="text-sm font-semibold tabular-nums text-hof">{g.progress}%</span>
                  </div>
                  {g.target && <p className="text-sm text-foggy">{g.target}</p>}
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-pearl" role="progressbar" aria-valuenow={g.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.title} progress`}>
                    <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${g.progress}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-6">
            <h2 className="text-balance text-lg font-semibold text-hof">Released reviews</h2>
            {reviews.length === 0 && <p className="mt-2 text-sm text-foggy">No released reviews yet.</p>}
            <ul className="mt-3 grid gap-4">
              {reviews.map((r) => (
                <li key={r.review_id} className="rounded-card border border-line-soft p-4">
                  <p className="text-2xl font-semibold tabular-nums text-hof">{r.rating}<span className="text-sm font-medium text-foggy"> / 5</span></p>
                  <p className="mt-1 text-[15px] leading-relaxed text-hof">{r.feedback}</p>
                  {r.strengths && <p className="mt-1 text-sm text-foggy">Strengths: {r.strengths}</p>}
                  {r.improvements && <p className="text-sm text-foggy">Focus next: {r.improvements}</p>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
