/**
 * Human-readable formatters for the UI. Every function returns a safe,
 * display-ready string: missing or malformed values become "—" (or a
 * human fallback) and never leak raw data.
 */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const EMPTY = "—";

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const raw = iso.trim();
  if (!raw) return null;
  // Date-only values are local dates; parsing them as UTC would shift the day.
  const value = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "12 Oct 2026", "—" when absent or invalid. */
export function fmtDay(iso: string | null | undefined): string {
  const date = parseDate(iso);
  if (!date) return EMPTY;
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** "09:30", "—" when absent or invalid. 24-hour clock. */
export function fmtTime(iso: string | null | undefined): string {
  const date = parseDate(iso);
  if (!date) return EMPTY;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** "12 Oct 2026, 09:30", "—" when absent or invalid. */
export function fmtDateTime(iso: string | null | undefined): string {
  const date = parseDate(iso);
  if (!date) return EMPTY;
  return `${fmtDay(iso)}, ${fmtTime(iso)}`;
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Paise → "₹48,500.00", "—" for missing or non-finite values. */
export function fmtMoney(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || !Number.isFinite(paise)) return EMPTY;
  return inr.format(paise / 100);
}

/** "2026-10" → "October 2026"; anything malformed → "Current period". */
export function periodLabel(period: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})$/.exec((period ?? "").trim());
  if (!match) return "Current period";
  const month = Number(match[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) return "Current period";
  return `${MONTHS_LONG[month - 1]} ${match[1]}`;
}

/** Up to two letters, "?" when no usable name is available. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = Array.from(parts[0]);
  if (parts.length === 1) {
    const pair = first.slice(0, 2).join("").toUpperCase();
    return pair || "?";
  }
  const second = Array.from(parts[1]);
  const pair = `${first[0] ?? ""}${second[0] ?? ""}`.toUpperCase();
  return pair || "?";
}

/** Display name for an employee payload; never a database id. */
export function employeeLabel(
  employee: { name?: string | null; full_name?: string | null } | null | undefined
): string {
  const name = employee?.name?.trim() || employee?.full_name?.trim();
  return name || "Employee";
}

/** Display title for a job payload; never a database id. */
export function jobLabel(job: { title?: string | null; name?: string | null } | null | undefined): string {
  return job?.title?.trim() || job?.name?.trim() || "Role";
}

/** Absolute http(s) URLs only; `javascript:`, `data:` and malformed input → null. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
