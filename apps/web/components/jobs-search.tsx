"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface JobSuggestion {
  jobId: string;
  title: string;
  slug: string;
}

// Public-jobs autocomplete (PRD §9.8): suggestions come from the Redis index
// with an indexed-catalog fallback, so a KV outage degrades to a slower list.
export function JobsSearch() {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<JobSuggestion[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setSuggestions([]);
      setShowSuggest(false);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
        const res = await fetch(`${base}/api/v1/jobs/suggest?q=${encodeURIComponent(q.trim())}&limit=6`);
        if (!res.ok) return;
        const body = (await res.json()) as { data: JobSuggestion[] };
        setSuggestions(body.data);
        setShowSuggest(true);
      } catch {
        // suggestions are best-effort; the full list below always works
      }
    }, 180);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  return (
    <div className="relative mt-6 max-w-md">
      <input
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => suggestions.length > 0 && setShowSuggest(true)}
        onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
        placeholder="Search open roles…"
        aria-label="Search open roles"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={showSuggest && suggestions.length > 0}
        aria-controls="jobs-suggestions"
        className="h-11 w-full rounded-full border border-line bg-white px-5 text-sm text-hof outline-none focus:border-hof focus-visible:ring-2 focus-visible:ring-emerald-600/30"
      />
      {showSuggest && suggestions.length > 0 && (
        <ul
          id="jobs-suggestions"
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-line-soft bg-white py-1 shadow-pop"
        >
          {suggestions.map((s) => (
            <li key={s.jobId}>
              <Link
                href={`/jobs/${s.slug}`}
                onClick={() => setShowSuggest(false)}
                className="block px-5 py-2.5 text-sm font-medium text-hof hover:bg-pearl"
              >
                {s.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
