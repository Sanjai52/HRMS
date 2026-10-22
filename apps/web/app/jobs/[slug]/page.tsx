import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin } from "@phosphor-icons/react/dist/ssr";
import { ErrorState } from "../../../components/feedback";
import { Card } from "../../../components/ui";
import { fmtDay } from "../../../lib/format";

interface JobDetailData {
  title: string;
  department: string | null;
  description: string | null;
  required_skills: string[] | null;
  experience: string | null;
  location: string | null;
  employment_type: string | null;
  salary_range: string | null;
  closing_date: string | null;
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

function closingInfo(value: string | null): { label: string; closed: boolean } | null {
  if (!value) return null;
  const label = fmtDay(value);
  if (label === "—") return null;
  // A date-only closing date stays open through the end of that day.
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59` : value);
  if (Number.isNaN(parsed.getTime())) return null;
  return { label, closed: parsed.getTime() < Date.now() };
}

async function loadJob(slug: string): Promise<{
  job: JobDetailData | null;
  missing: boolean;
  loadFailed: boolean;
}> {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
  try {
    const res = await fetch(`${base}/api/v1/jobs/${encodeURIComponent(slug)}`, { next: { revalidate: 60 } });
    if (res.status === 404) return { job: null, missing: true, loadFailed: false };
    if (!res.ok) return { job: null, missing: false, loadFailed: true };
    const body = (await res.json()) as { data?: unknown };
    if (!body.data || typeof body.data !== "object") {
      return { job: null, missing: false, loadFailed: true };
    }
    return { job: body.data as JobDetailData, missing: false, loadFailed: false };
  } catch {
    // A network/5xx failure is not the same thing as a removed role.
    return { job: null, missing: false, loadFailed: true };
  }
}

export default async function JobDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { job, missing, loadFailed } = await loadJob(slug);

  if (missing) notFound();

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center px-4 sm:px-6">
          <Link href="/jobs" className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
            <span className="grid h-8 w-8 place-items-center rounded-control bg-brand text-sm font-semibold text-ink-inverse">
              H
            </span>
            HRMS
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        {loadFailed || !job ? (
          <ErrorState
            title="We couldn't load this role"
            body="Try again in a moment."
            actionLabel="Back to open roles"
            actionHref="/jobs"
          />
        ) : (
          <JobContent job={job} slug={slug} />
        )}
      </main>
    </div>
  );
}

function JobContent({ job, slug }: { job: JobDetailData; slug: string }) {
  const meta = [job.department, job.location, employmentTypeLabel(job.employment_type)].filter(
    (part): part is string => Boolean(part && part.trim())
  );
  const skills = Array.isArray(job.required_skills) ? job.required_skills.filter(Boolean) : [];
  const salary = job.salary_range?.trim() ?? "";
  const closing = closingInfo(job.closing_date);
  const description = job.description?.trim() || "Details shared during screening.";

  return (
    <>
      {meta.length > 0 && (
        <p className="flex items-start gap-1.5 text-[13px] font-medium text-ink-secondary">
          <MapPin size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {meta.join(" · ")}
        </p>
      )}
      <h1 className="mt-2 text-[25px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-3xl">
        {job.title?.trim() || "Open role"}
      </h1>
      {salary && <p className="mt-2 text-sm font-medium text-ink">{salary}</p>}

      <Card className="mt-6 p-6">
        <h2 className="text-sm font-semibold text-ink">About the role</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-secondary">{description}</p>

        {skills.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Required skills">
            {skills.map((skill) => (
              <li key={skill} className="rounded-full bg-surface-muted px-3 py-1 text-[13px] font-medium text-ink">
                {skill}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 grid gap-1.5 text-sm text-ink-secondary">
          {job.experience?.trim() && (
            <p>
              Experience: <span className="font-medium text-ink">{job.experience}</span>
            </p>
          )}
          {closing && (
            <p>
              {closing.closed ? "Applications closed on" : "Apply by"}:{" "}
              <span className="font-medium text-ink">{closing.label}</span>
            </p>
          )}
        </div>

        {closing?.closed ? (
          <p className="mt-6 inline-flex rounded-control bg-surface-muted px-3 py-2 text-sm font-medium text-ink-secondary">
            This role is closed.
          </p>
        ) : (
          <Link
            href={`/jobs/${slug}/apply`}
            className="mt-6 inline-flex h-10 items-center gap-1.5 rounded-control bg-primary px-4 text-sm font-medium text-ink-inverse transition-colors hover:bg-primary-hover"
          >
            Apply now <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
      </Card>

      <Link
        href="/jobs"
        className="mt-6 inline-block text-[13px] font-medium text-primary underline underline-offset-4 hover:text-primary-hover"
      >
        Back to open roles
      </Link>
    </>
  );
}
