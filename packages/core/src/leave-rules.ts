export const ORG_TIMEZONE = "Asia/Kolkata";
export const LATE_AFTER = "09:30";

export function workdayOf(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ORG_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

export function clockNow(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ORG_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return parts;
}

export function isLate(checkIn: Date): boolean {
  return clockNow(checkIn) > LATE_AFTER;
}

export function countWorkdays(startDate: string, endDate: string, holidays: Set<string>): number {
  let count = 0;
  const day = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (day <= end) {
    const dow = day.getUTCDay();
    const iso = day.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidays.has(iso)) count += 1;
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return count;
}
