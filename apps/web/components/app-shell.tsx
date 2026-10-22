"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
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
import { requestJson, rolesOf } from "../lib/api";
import { initials } from "../lib/format";

const ALL_ROLES = ["EMPLOYEE", "MANAGER", "HR", "ADMIN"];

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

function roleLabelFor(roles: string[] | null): string {
  if (!roles) return "Account";
  if (roles.includes("ADMIN")) return "Admin";
  if (roles.includes("HR")) return "HR";
  if (roles.includes("MANAGER")) return "Manager";
  if (roles.includes("EMPLOYEE")) return "Employee";
  return "Account";
}

function signOut(): void {
  sessionStorage.removeItem("hrms_token");
  sessionStorage.removeItem("hrms_csrf");
  window.location.href = "/login";
}

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-9 items-center gap-2 rounded-control px-3 text-[13px] font-medium transition-colors",
        active ? "bg-primary-soft text-primary-ink" : "text-ink-secondary hover:bg-surface-muted hover:text-ink"
      )}
    >
      {active && (
        <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-primary" />
      )}
      <Icon size={18} weight={active ? "fill" : "regular"} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function Sidebar({
  roles,
  onNavigate,
  onClose,
  closeButtonRef,
}: {
  roles: string[] | null;
  onNavigate?: () => void;
  onClose?: () => void;
  closeButtonRef?: Ref<HTMLButtonElement>;
}) {
  const pathname = usePathname();
  const items = roles === null ? [] : navFor(roles).filter((item) => item.roles.some((r) => roles.includes(r)));
  const adminItems = roles === null ? [] : ADMIN_NAV.filter((item) => item.roles.some((r) => roles.includes(r)));

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 shrink-0 items-center gap-2 pl-4", onClose ? "pr-2" : "pr-4")}>
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className={cn("flex min-w-0 items-center gap-2.5 rounded-control", FOCUS_RING)}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-brand text-sm font-semibold text-white">
            H
          </span>
          <span className="truncate text-[15px] font-semibold tracking-tight text-ink">HRMS</span>
        </Link>
        {onClose && (
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className={cn(
              "ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-control text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink",
              FOCUS_RING
            )}
          >
            <X size={20} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 pt-3">
        {items.length > 0 && (
          <nav aria-label="Workspace">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Workspace</p>
            <div className="flex flex-col gap-0.5">
              {items.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
              ))}
            </div>
          </nav>
        )}
        {adminItems.length > 0 && (
          <nav aria-label="Administration" className="mt-4 border-t border-line-soft pt-4">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Admin</p>
            <div className="flex flex-col gap-0.5">
              {adminItems.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
              ))}
            </div>
          </nav>
        )}
      </div>

      <div className="border-t border-line-soft p-3">
        <button
          type="button"
          onClick={signOut}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-control px-3 text-[13px] font-medium text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink",
            FOCUS_RING
          )}
        >
          <SignOut size={18} aria-hidden="true" />
          Log out
        </button>
      </div>
    </div>
  );
}

function NotificationsLink({ count }: { count: number | null }) {
  const label = typeof count === "number" && count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      className={cn(
        "relative grid h-9 w-9 place-items-center rounded-control text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink",
        FOCUS_RING
      )}
    >
      <Bell size={18} aria-hidden="true" />
      {typeof count === "number" && count > 0 && (
        <span aria-hidden="true" className="absolute right-[7px] top-[7px] h-2 w-2 rounded-full bg-primary ring-2 ring-surface" />
      )}
    </Link>
  );
}

function UserMenu({ name, roles }: { name: string; roles: string[] | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const displayName = name.trim();
  const roleLabel = roleLabelFor(roles);
  const avatarText = initials(displayName || roleLabel);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div
      className="relative"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={displayName ? `Account menu for ${displayName}` : "Account menu"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 items-center gap-2 rounded-control p-0 text-left transition-colors hover:bg-surface-muted lg:pr-2",
          FOCUS_RING
        )}
      >
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary-ink"
        >
          {avatarText}
        </span>
        <span className="hidden min-w-0 max-w-[140px] lg:block">
          <span className="block truncate text-[13px] font-medium leading-[1.15] text-ink">
            {displayName || roleLabel}
          </span>
          {displayName && (
            <span className="block truncate text-[11px] leading-[1.2] text-ink-muted">{roleLabel}</span>
          )}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-11 w-52 overflow-hidden rounded-card border border-line bg-surface py-1 shadow-pop"
        >
          <Link
            role="menuitem"
            href="/profile"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-surface-muted"
          >
            Profile
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={signOut}
            className="block w-full px-3 py-2 text-left text-[13px] font-medium text-ink transition-colors hover:bg-surface-muted"
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

interface MeResponse {
  name?: string | null;
}

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<string[] | null>(null);
  const [name, setName] = useState("");
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setRoles(rolesOf(sessionStorage.getItem("hrms_token")));
  }, []);

  // Best-effort identity: the shell still works when the API is unavailable.
  useEffect(() => {
    const token = sessionStorage.getItem("hrms_token");
    if (!token) return;
    let cancelled = false;
    void requestJson<MeResponse | null>("/api/v1/employees/me", undefined, token)
      .then(({ data }) => {
        if (!cancelled && typeof data?.name === "string") setName(data.name.trim());
      })
      .catch(() => {
        // Fall back to the role label and initials.
      });
    void requestJson<{ count?: number }>("/api/v1/notifications/unread-count", undefined, token)
      .then(({ data }) => {
        if (!cancelled && typeof data?.count === "number" && Number.isFinite(data.count)) {
          setUnreadCount(data.count);
        }
      })
      .catch(() => {
        // No badge when the count is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    const token = typeof window !== "undefined" ? sessionStorage.getItem("hrms_token") : null;
    const term = q.trim();
    if (!token || term.length < 2) {
      setSuggestions([]);
      return;
    }
    suggestTimer.current = setTimeout(async () => {
      try {
        const { data } = await requestJson<Suggestion[]>(
          `/api/v1/search/suggest?q=${encodeURIComponent(term)}&limit=6`,
          undefined,
          token
        );
        const rows = Array.isArray(data) ? data : [];
        setSuggestions(rows);
        setShowSuggest(rows.length > 0);
      } catch {
        // suggestions are best-effort; full search always works
      }
    }, 180);
    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
    };
  }, [q]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    function onViewportChange(event: MediaQueryListEvent) {
      if (event.matches) setOpen(false);
    }
    desktop.addEventListener("change", onViewportChange);
    return () => desktop.removeEventListener("change", onViewportChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !drawerRef.current) return;
      const nodes = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (nodes.length === 0) {
        e.preventDefault();
        drawerRef.current.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!drawerRef.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      menuButtonRef.current?.focus();
    };
  }, [open]);

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-line bg-surface lg:block">
        <Sidebar roles={roles} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/30"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            tabIndex={-1}
            className="absolute inset-y-0 left-0 flex w-72 flex-col bg-surface shadow-pop outline-none"
          >
            <Sidebar
              roles={roles}
              onNavigate={() => setOpen(false)}
              onClose={() => setOpen(false)}
              closeButtonRef={closeButtonRef}
            />
          </div>
        </div>
      )}

      <div className="w-full lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-4 backdrop-blur md:gap-3 md:px-6">
          <button
            ref={menuButtonRef}
            type="button"
            aria-label="Open navigation"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(true)}
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-control text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink lg:hidden",
              FOCUS_RING
            )}
          >
            <List size={20} aria-hidden="true" />
          </button>

          <div className="relative min-w-0 flex-1 lg:w-[280px] lg:flex-none">
            <form
              role="search"
              className="flex h-9 items-center gap-2 rounded-control bg-surface-muted px-3 transition-shadow focus-within:ring-2 focus-within:ring-primary"
              onSubmit={(e) => {
                e.preventDefault();
                setShowSuggest(false);
                window.location.href = `/hr/employees?q=${encodeURIComponent(q)}`;
              }}
            >
              <MagnifyingGlass size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />
              <input
                aria-label="Search people, jobs, pages"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showSuggest && suggestions.length > 0}
                aria-controls="topbar-suggestions"
                autoComplete="off"
                spellCheck={false}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggest(true)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setShowSuggest(false);
                }}
                placeholder="Search people, jobs, pages"
                className="h-full w-full min-w-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-muted"
              />
            </form>
            {showSuggest && suggestions.length > 0 && (
              <ul
                id="topbar-suggestions"
                role="listbox"
                aria-label="Employee suggestions"
                className="absolute inset-x-0 top-11 z-40 max-h-80 overflow-y-auto rounded-card border border-line bg-surface py-1 shadow-pop"
              >
                {suggestions.map((s) => (
                  <li key={s.employeeId} role="option" aria-selected="false">
                    <Link
                      href={`/hr/employees/${s.employeeId}`}
                      onClick={() => setShowSuggest(false)}
                      className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface-muted"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary-ink">
                        {initials(s.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-ink">{s.name}</span>
                        <span className="block truncate text-[11px] text-ink-secondary">{s.department}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <NotificationsLink count={unreadCount} />
            <UserMenu name={name} roles={roles} />
          </div>
        </header>

        <main
          className="relative min-h-[calc(100dvh-56px)] bg-canvas"
          style={{
            backgroundImage:
              "radial-gradient(900px 320px at 20% -10%, rgba(4,120,87,0.06), transparent 70%)",
          }}
        >
          <div className="mx-auto w-full max-w-[1700px] p-4 md:p-6 lg:p-8">
            <h1 className="mb-6 text-[25px] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</h1>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
