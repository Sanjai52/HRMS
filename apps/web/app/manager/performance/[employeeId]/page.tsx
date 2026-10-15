"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../../components/app-shell";
import { Button, Card, Field, TextInput, StatusPill, SkeletonRows } from "../../../../components/ui";
import { authed } from "../../../../lib/hr";

interface Goal {
  goal_id: string;
  title: string;
  target: string;
  progress: number;
  status: string;
}

interface Review {
  review_id: string;
  employee_id: string;
  cycle_id: string;
  rating: number | null;
  feedback: string;
  status: string;
}

interface Cycle {
  cycle_id: string;
  name: string;
  status: string;
}

export default function MemberPerformance({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = use(params);
  const [name, setName] = useState("Team member");
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [gTitle, setGTitle] = useState("");
  const [gTarget, setGTarget] = useState("");
  const [rating, setRating] = useState("4");
  const [feedback, setFeedback] = useState("");

  async function load(cid: string) {
    try {
      const [g, r] = await Promise.all([
        authed<Goal[]>(`/api/v1/performance/goals?employeeId=${employeeId}${cid ? `&cycleId=${cid}` : ""}`),
        authed<Review[]>(`/api/v1/performance/team${cid ? `?cycleId=${cid}` : ""}`),
      ]);
      setGoals(g);
      setReviews(r.filter((x) => x.employee_id === employeeId));
      const emp = await authed<{ name: string }>(`/api/v1/employees/${employeeId}`).catch(() => null);
      if (emp) setName(emp.name);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    authed<Cycle[]>("/api/v1/performance/cycles").then((c) => {
      setCycles(c.filter((x) => x.status === "ACTIVE"));
      const first = c.find((x) => x.status === "ACTIVE");
      if (first) {
        setCycleId(first.cycle_id);
        load(first.cycle_id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  return (
    <AppShell title={name}>
      <div className="grid max-w-3xl gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-hof">
            Cycle{" "}
            <select aria-label="Review cycle" value={cycleId} onChange={(e) => { setCycleId(e.target.value); load(e.target.value); }} className="h-10 rounded-input border border-line bg-white px-3 text-sm outline-none transition duration-200 focus:border-hof focus-visible:ring-2 focus-visible:ring-hof/40">
              {cycles.map((c) => (
                <option key={c.cycle_id} value={c.cycle_id}>{c.name}</option>
              ))}
            </select>
          </label>
          <Link href="/manager/performance" className="ml-auto rounded-full px-2 py-1 text-sm font-semibold text-hof outline-none transition duration-200 underline underline-offset-4 hover:text-black focus-visible:ring-2 focus-visible:ring-hof/40 active:scale-[0.98]">
            Back to team
          </Link>
        </div>

        <Card className="p-6">
          <h2 className="text-balance text-lg font-semibold text-hof">Goals</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                await authed("/api/v1/performance/goals", undefined, { method: "POST", body: JSON.stringify({ employeeId, cycleId, title: gTitle, target: gTarget }) });
                setGTitle("");
                setGTarget("");
                await load(cycleId);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
            className="mt-3 grid gap-3 sm:grid-cols-3"
          >
            <Field label="Goal">
              <TextInput value={gTitle} onChange={(e) => setGTitle(e.target.value)} required minLength={3} />
            </Field>
            <Field label="Target">
              <TextInput value={gTarget} onChange={(e) => setGTarget(e.target.value)} placeholder="e.g. p95 under 300ms" />
            </Field>
            <div className="flex items-end">
              <Button type="submit" className="w-full">Add goal</Button>
            </div>
          </form>
          <ul className="mt-3 grid gap-2">
            {goals.length === 0 && <li className="text-sm text-foggy">No goals for this cycle yet. Add the first one above.</li>}
            {goals.map((g) => (
              <li key={g.goal_id} className="rounded-input bg-pearl px-4 py-2.5 text-sm">
                <span className="font-semibold text-hof">{g.title}</span>
                <span className="tabular-nums text-foggy"> · {g.progress}%{g.target ? ` · ${g.target}` : ""}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <h2 className="text-balance text-lg font-semibold text-hof">Write a review</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setNotice("");
              try {
                const out = await authed<{ reviewId: string }>("/api/v1/performance/reviews", undefined, {
                  method: "POST",
                  body: JSON.stringify({ employeeId, cycleId, rating: Number(rating), feedback }),
                });
                await authed(`/api/v1/performance/reviews/${out.reviewId}/submit`, undefined, { method: "POST" });
                setFeedback("");
                setNotice("Review submitted. HR releases it to the employee.");
                await load(cycleId);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
            className="mt-3 grid gap-3 sm:grid-cols-2"
          >
            <Field label="Rating (1–5)">
              <select aria-label="Rating" value={rating} onChange={(e) => setRating(e.target.value)} className="h-12 rounded-input border border-line bg-white px-3 text-[15px] outline-none transition duration-200 focus:border-hof focus-visible:ring-2 focus-visible:ring-hof/40">
                {["1", "2", "3", "4", "5"].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </Field>
            <Field label="Feedback">
              <TextInput value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What went well, what next" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full">Submit review</Button>
            </div>
          </form>
          {notice && <p className="mt-3 text-sm font-medium text-rausch-dark">{notice}</p>}
          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-rausch-dark">
              {error}
            </p>
          )}
          <ul className="mt-4 grid gap-2">
            {reviews.length === 0 && <li className="text-sm text-foggy">No reviews written for this cycle yet.</li>}
            {reviews.map((r) => (
              <li key={r.review_id} className="flex items-center gap-3 rounded-input bg-pearl px-4 py-2.5 text-sm">
                <span className="font-semibold tabular-nums text-hof">{r.rating ?? "—"}/5</span>
                <span className="flex-1 truncate text-foggy">{r.feedback || "draft"}</span>
                <StatusPill status={r.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}
