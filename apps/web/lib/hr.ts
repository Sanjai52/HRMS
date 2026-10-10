const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

export async function authed<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const t = token ?? (typeof window !== "undefined" ? sessionStorage.getItem("hrms_token") : null);
  const csrf = typeof window !== "undefined" ? sessionStorage.getItem("hrms_csrf") : null;
  const res = await fetch(`${base}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(t ? { authorization: `Bearer ${t}` } : {}),
      ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 429) throw new Error("Too many requests. Wait a moment and try again.");
  if (res.status === 401) throw new Error("Your session expired. Log in again.");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `request-failed:${res.status}`);
  }
  return ((await res.json()) as { data: T }).data;
}

export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(typeof iso === "string" && iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
