import Link from "next/link";
import { ArrowRight, Users, CalendarCheck, Wallet } from "@phosphor-icons/react/dist/ssr";
import { Button, Card } from "../components/ui";

export default function Landing() {
  return (
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-30 border-b border-line-soft bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 md:px-8">
          <span className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-rausch">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-rausch text-base font-black text-white">H</span>
            HRMS
          </span>
          <nav className="ml-auto flex items-center gap-2">
            <Link href="/login" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-hof hover:bg-pearl sm:block">
              Log in
            </Link>
            <Link
              href="/login"
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-hof px-5 text-sm font-semibold text-white transition hover:bg-black active:scale-[0.98]"
            >
              Sign in <ArrowRight size={16} />
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 md:px-8">
        <section className="grid items-center gap-10 py-14 md:grid-cols-2 md:py-20">
          <div>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-hof md:text-6xl">
              Every people process, one workspace
            </h1>
            <p className="mt-4 max-w-[46ch] text-lg leading-relaxed text-foggy">
              Directory, attendance, leave, payroll and hiring for growing teams.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login">
                <Button>Sign in to HRMS</Button>
              </Link>
              <Link
                href="#features"
                className="inline-flex h-12 items-center rounded-full border border-hof px-6 text-[15px] font-semibold text-hof transition hover:bg-pearl active:scale-[0.98]"
              >
                Explore features
              </Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-card shadow-pop">
            <img
              src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=70"
              alt="HR team collaborating around a table in a bright office"
              className="aspect-[4/3] w-full object-cover"
              loading="eager"
            />
          </div>
        </section>

        <section id="features" className="grid scroll-mt-20 gap-4 pb-16 md:grid-cols-3">
          {[
            { icon: Users, title: "People directory", body: "Profiles, departments and roles with fast search across the organization." },
            { icon: CalendarCheck, title: "Time off and attendance", body: "Check-in and check-out, leave balances and manager approvals in one flow." },
            { icon: Wallet, title: "Payroll and hiring", body: "Pay periods, payslips, job postings and a full recruitment pipeline." },
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
              <h2 className="text-3xl font-extrabold tracking-tight">Run people ops in one place</h2>
              <p className="mt-2 max-w-[46ch] leading-relaxed text-white/70">
                Sign in to see your dashboard, team and pending approvals.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-flex h-12 items-center rounded-full bg-rausch px-6 text-[15px] font-semibold text-white transition hover:bg-rausch-dark active:scale-[0.98]"
              >
                Sign in to HRMS
              </Link>
            </div>
            <img
              src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1000&q=70"
              alt="Two colleagues discussing work in a modern office"
              className="aspect-[10/7] w-full rounded-input object-cover"
              loading="lazy"
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-line-soft">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm md:grid-cols-3 md:px-8">
          <div>
            <p className="flex items-center gap-2 text-base font-extrabold tracking-tight text-rausch">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-rausch text-xs font-black text-white">H</span>
              HRMS
            </p>
            <p className="mt-2 max-w-[36ch] leading-relaxed text-foggy">
              People operations for growing teams.
            </p>
          </div>
          <nav aria-label="Product">
            <p className="font-semibold text-hof">Product</p>
            <ul className="mt-3 grid gap-2 text-foggy">
              <li><Link href="/hr/employees" className="hover:text-hof hover:underline">Employee directory</Link></li>
              <li><Link href="/attendance" className="hover:text-hof hover:underline">Attendance</Link></li>
              <li><Link href="/leave" className="hover:text-hof hover:underline">Leave</Link></li>
              <li><Link href="/payroll" className="hover:text-hof hover:underline">Payroll</Link></li>
            </ul>
          </nav>
          <nav aria-label="Account">
            <p className="font-semibold text-hof">Account</p>
            <ul className="mt-3 grid gap-2 text-foggy">
              <li><Link href="/login" className="hover:text-hof hover:underline">Sign in</Link></li>
              <li><Link href="/dashboard" className="hover:text-hof hover:underline">Dashboard</Link></li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-line-soft">
          <p className="mx-auto max-w-7xl px-4 py-5 text-[13px] text-foggy md:px-8">© 2026 HRMS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
