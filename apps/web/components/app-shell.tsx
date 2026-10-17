"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect, type ReactNode } from "react";
import {
  House,
  Users,
  UsersThree,
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
  Database,
  Heartbeat,
  Scroll,
  UserGear,
  ShieldCheck,
} from "@phosphor-icons/react";
import { cn } from "../lib/cn";
import { rolesOf } from "../lib/api";

const ALL_ROLES = ["EMPLOYEE", "MANAGER", "HR", "ADMIN"];

interface NavItem {
  label: string;
  href: string;
  icon: typeof House;
  roles: readonly string[];
}

/** Role-aware sidebar shape (Task 17, R3): HR/ADMIN point at the management pages,
 *  everyone else at their self-service pages. */
function navFor(roles: string[]): NavItem[] {
  const management = roles.includes("HR") || roles.includes("ADMIN");
  const items: NavItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: House, roles: ALL_ROLES },
  ];
  if (roles.includes("MANAGER")) {
    items.push({ label: "My team", href: "/manager/team", icon: UsersThree, roles: ["MANAGER"] });
  }
  items.push(
    { label: "Employees", href: "/hr/employees", icon: Users, roles: ["MANAGER", "HR", "ADMIN"] },
    { label: "Attendance", href: management ? "/hr/attendance" : "/attendance", icon: CalendarCheck, roles: ALL_ROLES },
    { label: "Leave", href: management ? "/hr/leave" : "/leave", icon: Suitcase, roles: ALL_ROLES },
    { label: "Payroll", href: management ? "/hr/payroll" : "/payroll", icon: Wallet, roles: ALL_ROLES },
    { label: "Recruitment", href: "/hr/recruitment", icon: Briefcase, roles: ["HR", "ADMIN"] },
    { label: "Performance", href: management ? "/hr/performance" : "/performance", icon: ChartLineUp, roles: ALL_ROLES },
    { label: "Reports", href: "/hr/reports", icon: ChartLineUp, roles: ["HR", "ADMIN"] },
    { label: "Settings", href: "/settings", icon: Gear, roles: ["ADMIN"] }
  );
  return items;
}

const ADMIN_NAV: NavItem[] = [
  { label: "Users & roles", href: "/admin/users", icon: UserGear, roles: ["ADMIN"] },
  { label: "Roles", href: "/admin/roles", icon: ShieldCheck, roles: ["ADMIN"] },
  { label: "Audit log", href: "/admin/audit-logs", icon: Scroll, roles: ["ADMIN"] },
  { label: "System health", href: "/admin/system-health", icon: Heartbeat, roles: ["ADMIN"] },
  { label: "Shards", href: "/admin/shards", icon: Database, roles: ["ADMIN"] },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-input px-3 py-2.5 text-[15px] transition",
        active ? "bg-pearl font-semibold text-hof" : "text-foggy hover:bg-pearl hover:text-hof"
      )}
    >
      <Icon size={20} weight={active ? "fill" : "regular"} />
      {item.label}
    </Link>
  );
}

function Sidebar({ roles, onNavigate }: { roles: string[] | null; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = roles === null ? [] : navFor(roles).filter((item) => item.roles.some((r) => roles.includes(r)));
  const adminItems = roles === null ? [] : ADMIN_NAV.filter((item) => item.roles.some((r) => roles.includes(r)));
  return (
    <div className="flex h-full flex-col gap-1 p-4">
      <Link href="/dashboard" onClick={onNavigate} className="mb-4 flex items-center gap-2 px-2">
        <span className="grid h-9 w-9 place-items-center rounded-card bg-rausch text-lg font-black text-white">H</span>
        <span className="text-lg font-extrabold tracking-tight text-hof">HRMS</span>
      </Link>
      {items.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
      ))}
      {adminItems.length > 0 && (
        <div className="mt-4 flex flex-col gap-1">
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-foggy">Admin</p>
          {adminItems.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
          ))}
        </div>
      )}
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

function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-10 w-10 place-items-center rounded-full bg-hof text-sm font-bold text-white transition hover:bg-black"
      >
        H
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-12 w-48 overflow-hidden rounded-card border border-line-soft bg-white py-1 shadow-pop"
        >
          <Link
            role="menuitem"
            href="/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm font-medium text-hof transition hover:bg-pearl"
          >
            Profile
          </Link>
          <button
            role="menuitem"
            onClick={() => {
              sessionStorage.removeItem("hrms_token");
              sessionStorage.removeItem("hrms_csrf");
              window.location.href = "/login";
            }}
            className="block w-full px-4 py-2.5 text-left text-sm font-medium text-hof transition hover:bg-pearl"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

interface Suggestion {
  employeeId: string;
  name: string;
  department: string;
}

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<string[] | null>(null);
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRoles(rolesOf(sessionStorage.getItem("hrms_token")));
  }, []);

  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    const token = typeof window !== "undefined" ? sessionStorage.getItem("hrms_token") : null;
    if (!token || q.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    suggestTimer.current = setTimeout(async () => {
      try {
        const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
        const res = await fetch(`${base}/api/v1/search/suggest?q=${encodeURIComponent(q.trim())}&limit=6`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const body = (await res.json()) as { data: Suggestion[] };
        setSuggestions(body.data);
        setShowSuggest(true);
      } catch {
        // suggestions are best-effort; full search always works
      }
    }, 180);
    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
    };
  }, [q]);

  return (
    <div className="min-h-dvh bg-white">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-line-soft lg:block">
        <Sidebar roles={roles} />
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
            <Sidebar roles={roles} onNavigate={() => setOpen(false)} />
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
          <div className="relative max-w-md flex-1">
            <form
              className="flex h-11 items-center gap-2 rounded-full border border-line bg-pearl/60 px-4"
              onSubmit={(e) => {
                e.preventDefault();
                setShowSuggest(false);
                window.location.href = `/hr/employees?q=${encodeURIComponent(q)}`;
              }}
            >
              <MagnifyingGlass size={18} className="shrink-0 text-foggy" />
              <input
                aria-label="Search employees"
                role="combobox"
                aria-expanded={showSuggest && suggestions.length > 0}
                aria-controls="topbar-suggestions"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggest(true)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setShowSuggest(false);
                }}
                placeholder="Search people, teams, roles"
                className="w-full bg-transparent text-sm text-hof outline-none placeholder:text-foggy"
              />
            </form>
            {showSuggest && suggestions.length > 0 && (
              <ul
                id="topbar-suggestions"
                role="listbox"
                aria-label="Employee suggestions"
                className="absolute inset-x-0 top-12 overflow-hidden rounded-card border border-line-soft bg-white shadow-pop"
              >
                {suggestions.map((s) => (
                  <li key={s.employeeId} role="option" aria-selected="false">
                    <Link
                      href={`/hr/employees/${s.employeeId}`}
                      onClick={() => setShowSuggest(false)}
                      className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-pearl"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rausch/10 text-xs font-extrabold text-rausch-dark">
                        {s.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-hof">{s.name}</span>
                        <span className="block truncate text-xs text-foggy">{s.department}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/notifications"
              aria-label="Notifications"
              className="grid h-10 w-10 place-items-center rounded-full border border-line-soft hover:bg-pearl"
            >
              <Bell size={20} />
            </Link>
            <UserMenu />
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
