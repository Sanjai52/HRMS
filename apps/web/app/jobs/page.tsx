import Link from "next/link";
import { ArrowRight, MapPin } from "@phosphor-icons/react/dist/ssr";
import { ErrorState } from "../../components/feedback";
import { Card, EmptyState } from "../../components/ui";
import { JobsSearch } from "../../components/jobs-search";

interface PublicJob {
  slug: string;
  title: string;
  department: string | null;
  location: string | null;
  employment_type: string | null;
  salary_range: string | null;
}

function employmentTypeLabel(value: string | null): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function loadJobs(): Promise<{ rows: PublicJob[]; loadFailed: boolean }> {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
  try {
    const res = await fetch(`${base}/api/v1/jobs`, { next: { revalidate: 60 } });
    if (!res.ok) return { rows: [], loadFailed: true };
    const body = (await res.json()) as { data?: unknown };
    if (!Array.isArray(body.data)) return { rows: [], loadFailed: true };
    return { rows: body.data as PublicJob[], loadFailed: false };
  } catch {
    // A failed request must stay distinguishable from a genuinely empty list.
    return { rows: [], loadFailed: true };
  }
}

export default async function JobsPage() {
  const { rows, loadFailed } = await loadJobs();

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
            <span className="grid h-8 w-8 place-items-center rounded-control bg-brand text-sm font-semibold text-ink-inverse">
              H
            </span>
            HRMS
          </Link>
          <nav className="ml-auto">
            <Link
              href="/login"
              className="inline-flex h-9 items-center gap-1.5 rounded-control bg-primary px-3.5 text-[13px] font-medium text-ink-inverse transition-colors hover:bg-primary-hover"
            >
              Employee sign in <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-[25px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-3xl">Open roles</h1>
        <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-ink-secondary">
          Find a role that fits and apply in minutes.
        </p>

        <JobsSearch />

        <div className="mt-8">
          {loadFailed ? (
            <ErrorState
              title="We couldn't load open roles"
              body="Try again in a moment."
              actionLabel="Try again"
              actionHref="/jobs"
            />
          ) : rows.length === 0 ? (
            <EmptyState title="No open roles right now" body="New roles are posted here as they open. Check back soon." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {rows.map((job) => {
                const details = [job.department, job.location, employmentTypeLabel(job.employment_type)].filter(
                  (part): part is string => Boolean(part && part.trim())
                );
                const salary = job.salary_range?.trim() ?? "";
                return (
                  <Link
                    key={job.slug}
                    href={`/jobs/${job.slug}`}
                    className="block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                  >
                    <Card className="h-full p-6 transition-shadow hover:shadow-pop">
                      <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">
                        {job.title?.trim() || "Open role"}
                      </h2>
                      {details.length > 0 && (
                        <p className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-relaxed text-ink-secondary">
                          <MapPin size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                          {details.join(" · ")}
                        </p>
                      )}
                      {salary && <p className="mt-3 text-sm font-medium text-ink">{salary}</p>}
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
