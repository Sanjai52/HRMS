import Link from "next/link";
import { ArrowRight, MapPin } from "@phosphor-icons/react/dist/ssr";
import { Button, Card } from "../../components/ui";

async function jobs() {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
  const res = await fetch(`${base}/api/v1/jobs`, { next: { revalidate: 60 } });
  if (!res.ok) return [];
  const body = (await res.json()) as { data: Array<{ job_id: string; slug: string; title: string; department: string; location: string; employment_type: string; salary_range: string }> };
  return body.data;
}

export default async function JobsPage() {
  const rows = await jobs();
  return (
    <div className="min-h-dvh bg-white">
      <header className="border-b border-line-soft">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 md:px-8">
          <Link href="/" className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-rausch">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-rausch text-base font-black text-white">H</span>
            HRMS
          </Link>
          <nav className="ml-auto">
            <Link href="/login" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-hof px-5 text-sm font-semibold text-white transition hover:bg-black active:scale-[0.98]">
              Employee sign in <ArrowRight size={16} />
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-12 md:px-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-hof md:text-4xl">Open roles</h1>
        <p className="mt-2 max-w-[60ch] leading-relaxed text-foggy">Find a role that fits and apply in minutes.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {rows.length === 0 && (
            <Card className="p-8 text-center md:col-span-2">
              <p className="font-semibold text-hof">No open roles right now</p>
              <p className="mt-1 text-sm text-foggy">Check back soon.</p>
            </Card>
          )}
          {rows.map((j) => (
            <Link key={j.job_id} href={`/jobs/${j.slug}`}>
              <Card className="h-full p-6 transition hover:shadow-pop">
                <h2 className="text-lg font-bold text-hof">{j.title}</h2>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-foggy">
                  <MapPin size={15} /> {j.department}{j.location ? ` · ${j.location}` : ""} · {j.employment_type.replace("_", " ").toLowerCase()}
                </p>
                {j.salary_range && <p className="mt-2 text-sm font-semibold text-hof">{j.salary_range}</p>}
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
