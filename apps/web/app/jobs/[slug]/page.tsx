import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin } from "@phosphor-icons/react/dist/ssr";
import { Card } from "../../../components/ui";

async function job(slug: string) {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
  const res = await fetch(`${base}/api/v1/jobs/${slug}`, { next: { revalidate: 60 } });
  if (!res.ok) return null;
  const body = (await res.json()) as { data: Record<string, unknown> };
  return body.data as {
    job_id: string;
    title: string;
    department: string;
    description: string;
    required_skills: string[];
    experience: string;
    location: string;
    employment_type: string;
    salary_range: string;
    closing_date: string | null;
  };
}

export default async function JobDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const j = await job(slug);
  if (!j) notFound();
  return (
    <div className="min-h-dvh bg-white">
      <header className="border-b border-line-soft">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 md:px-8">
          <Link href="/jobs" className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-rausch">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-rausch text-base font-black text-white">H</span>
            HRMS
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12 md:px-8">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foggy">
          <MapPin size={15} /> {j.department}{j.location ? ` · ${j.location}` : ""} · {j.employment_type.replace("_", " ").toLowerCase()}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-hof md:text-4xl">{j.title}</h1>
        {j.salary_range && <p className="mt-2 font-semibold text-hof">{j.salary_range}</p>}
        <Card className="mt-6 p-6">
          <h2 className="font-bold text-hof">About the role</h2>
          <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-foggy">{j.description || "Details shared during screening."}</p>
          {(j.required_skills ?? []).length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {(j.required_skills ?? []).map((s) => (
                <span key={s} className="rounded-full bg-pearl px-3 py-1.5 text-[13px] font-medium text-hof">{s}</span>
              ))}
            </div>
          )}
          <div className="mt-4 grid gap-1 text-sm text-foggy">
            {j.experience && <p>Experience: <span className="font-semibold text-hof">{j.experience}</span></p>}
            {j.closing_date && <p>Apply by: <span className="font-semibold text-hof">{j.closing_date}</span></p>}
          </div>
          <Link href={`/jobs/${slug}/apply`} className="mt-6 inline-flex h-12 items-center gap-1.5 rounded-full bg-rausch px-6 text-[15px] font-semibold text-white transition hover:bg-rausch-dark active:scale-[0.98]">
            Apply now <ArrowRight size={16} />
          </Link>
        </Card>
        <Link href="/jobs" className="mt-6 inline-block text-sm font-semibold text-hof underline underline-offset-4">
          All open roles
        </Link>
      </main>
    </div>
  );
}
