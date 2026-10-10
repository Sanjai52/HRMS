"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  House,
  Users,
  CalendarCheck,
  Suitcase,
  Wallet,
  Briefcase,
  ChartLineUp,
  Gear,
  Bell,
  MagnifyingGlass,
  List,
  X,
  SignOut,
} from "@phosphor-icons/react";
import { cn } from "../lib/cn";
import { rolesOf } from "../lib/api";

const NAV = [
  { label: "Dashboard", href: "/dashboard", icon: House, roles: ["EMPLOYEE", "MANAGER", "HR", "ADMIN"] },
  { label: "Employees", href: "/hr/employees", icon: Users, roles: ["MANAGER", "HR", "ADMIN"] },
  { label: "Attendance", href: "/attendance", icon: CalendarCheck, roles: ["EMPLOYEE", "MANAGER", "HR", "ADMIN"] },
  { label: "Leave", href: "/leave", icon: Suitcase, roles: ["EMPLOYEE", "MANAGER", "HR", "ADMIN"] },
  { label: "Payroll", href: "/payroll", icon: Wallet, roles: ["HR", "ADMIN"] },
  { label: "Recruitment", href: "/hr/recruitment", icon: Briefcase, roles: ["HR", "ADMIN"] },
  { label: "Performance", href: "/performance", icon: ChartLineUp, roles: ["EMPLOYEE", "MANAGER", "HR", "ADMIN"] },
  { label: "Reports", href: "/hr/reports", icon: ChartLineUp, roles: ["HR", "ADMIN"] },
  { label: "Settings", href: "/settings", icon: Gear, roles: ["ADMIN"] },
] as const;

function visibleNav(): Array<(typeof NAV)[number]> {
  if (typeof window === "undefined") return [...NAV];
  const roles = rolesOf(sessionStorage.getItem("hrms_token"));
  if (roles.length === 0) return [...NAV];
  return NAV.filter((item) => item.roles.some((r) => roles.includes(r)));
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col gap-1 p-4">
      <Link href="/dashboard" onClick={onNavigate} className="mb-4 flex items-center gap-2 px-2">
        <span className="grid h-9 w-9 place-items-center rounded-card bg-rausch text-lg font-black text-white">H</span>
        <span className="text-lg font-extrabold tracking-tight text-hof">HRMS</span>
      </Link>
      {visibleNav().map(({ label, href, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-input px-3 py-2.5 text-[15px] transition",
              active ? "bg-pearl font-semibold text-hof" : "text-foggy hover:bg-pearl hover:text-hof"
            )}
          >
            <Icon size={20} weight={active ? "fill" : "regular"} />
            {label}
          </Link>
        );
      })}
      <div className="mt-auto border-t border-line-soft pt-3">
        <button
          onClick={() => {
            sessionStorage.removeItem("hrms_token");
            sessionStorage.removeItem("hrms_csrf");
            window.location.href = "/login";
          }}
          className="flex w-full items-center gap-3 rounded-input px-3 py-2.5 text-[15px] text-foggy transition hover:bg-pearl hover:text-hof"
        >
          <SignOut size={20} />
          Log out
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  return (
    <div className="min-h-dvh bg-white">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-line-soft lg:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-hof/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-pop">
            <button
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full hover:bg-pearl"
            >
              <X size={20} />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line-soft bg-white/95 px-4 backdrop-blur md:px-6">
          <button
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-pearl lg:hidden"
          >
            <List size={22} />
          </button>
          <form
            className="flex h-11 max-w-md flex-1 items-center gap-2 rounded-full border border-line bg-pearl/60 px-4"
            onSubmit={(e) => {
              e.preventDefault();
              window.location.href = `/hr/employees?q=${encodeURIComponent(q)}`;
            }}
          >
            <MagnifyingGlass size={18} className="shrink-0 text-foggy" />
            <input
              aria-label="Search employees"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people, teams, roles"
              className="w-full bg-transparent text-sm text-hof outline-none placeholder:text-foggy"
            />
          </form>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/notifications"
              aria-label="Notifications"
              className="grid h-10 w-10 place-items-center rounded-full border border-line-soft hover:bg-pearl"
            >
              <Bell size={20} />
            </Link>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-hof text-sm font-bold text-white">H</span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
          <h1 className="mb-6 text-2xl font-extrabold tracking-tight text-hof md:text-[28px]">{title}</h1>
          {children}
        </main>
      </div>
    </div>
  );
}
