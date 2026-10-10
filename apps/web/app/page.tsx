import Link from "next/link";
import { ArrowRight, Database, Lightning, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { Button, Card } from "../components/ui";

export default function Landing() {
  return (
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-30 border-b border-line-soft bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 md:px-8">
          <span className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-rausch">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-rausch text-base font-black text-white">H</span>
            hrms
          </span>
          <nav className="ml-auto flex items-center gap-2">
            <Link href="/login" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-hof hover:bg-pearl sm:block">
              Log in
            </Link>
            <Link
              href="/login"
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-hof px-5 text-sm font-semibold text-white transition hover:bg-black active:scale-[0.98]"
            >
              Get started <ArrowRight size={16} />
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 md:px-8">
        <section className="grid items-center gap-10 py-14 md:grid-cols-2 md:py-20">
          <div>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-hof md:text-6xl">
              People ops that scale with headcount
            </h1>
            <p className="mt-4 max-w-[46ch] text-lg leading-relaxed text-foggy">
              Attendance, leave, payroll and hiring on one sharded workspace.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login">
                <Button>Open dashboard</Button>
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center rounded-full border border-hof px-6 text-[15px] font-semibold text-hof transition hover:bg-pearl active:scale-[0.98]"
              >
                HR sign in
              </Link>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line-soft pt-6">
              {[
                ["3", "live shards"],
                ["8", "design systems"],
                ["256", "hash buckets"],
              ].map(([v, k]) => (
                <div key={k}>
                  <dt className="sr-only">{k}</dt>
                  <dd className="text-2xl font-extrabold text-hof">{v}</dd>
                  <dd className="text-sm text-foggy">{k}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="overflow-hidden rounded-card shadow-pop">
            <img
              src="https://picsum.photos/seed/hrms-team-workspace/1200/900"
              alt="HR team reviewing people operations in a bright office"
              className="aspect-[4/3] w-full object-cover"
              loading="eager"
            />
          </div>
        </section>

        <section className="grid gap-4 pb-16 md:grid-cols-3">
          {[
            { icon: Database, title: "Sharded by design", body: "Employee records route across live shards through a versioned hash ring." },
            { icon: Lightning, title: "Async heavy work", body: "Payroll, notifications and sourcing run on workers, never blocking the UI." },
            { icon: ShieldCheck, title: "Audited by default", body: "Role-scoped access with an atomic audit trail on every sensitive change." },
          ].map(({ icon: Icon, title, body }) => (
            <Card key={title} className="p-6">
              <span className="grid h-11 w-11 place-items-center rounded-card bg-rausch/10 text-rausch">
                <Icon size={22} weight="fill" />
              </span>
              <h2 className="mt-4 text-lg font-bold text-hof">{title}</h2>
              <p className="mt-1 text-[15px] leading-relaxed text-foggy">{body}</p>
            </Card>
          ))}
        </section>

        <section className="mb-16 overflow-hidden rounded-card bg-hof text-white">
          <div className="grid items-center gap-8 p-8 md:grid-cols-2 md:p-12">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight">Bring the whole org in one view</h2>
              <p className="mt-2 max-w-[46ch] leading-relaxed text-white/70">
                Directory, attendance and leave approvals stay consistent while data grows.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-flex h-12 items-center rounded-full bg-rausch px-6 text-[15px] font-semibold text-white transition hover:bg-rausch-dark active:scale-[0.98]"
              >
                Start with HR login
              </Link>
            </div>
            <img
              src="https://picsum.photos/seed/hrms-org-overview/1000/700"
              alt="Overview of an organization at work"
              className="aspect-[10/7] w-full rounded-input object-cover"
              loading="lazy"
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-line-soft">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-6 text-sm text-foggy md:px-8">
          <span className="font-extrabold text-rausch">hrms</span>
          <span>Academic prototype — UCS3513 Mini Project 6.</span>
        </div>
      </footer>
    </div>
  );
}
