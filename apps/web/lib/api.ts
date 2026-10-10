export async function api<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
  const csrf = typeof window !== "undefined" ? sessionStorage.getItem("hrms_csrf") : null;
  const res = await fetch(`${base}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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
  const body = (await res.json()) as { data: T };
  return body.data;
}

export function rolesOf(token: string | null): string[] {
  if (!token) return [];
  try {
    const payload = JSON.parse(atob(token.split(".")[1])) as { roles?: string[] };
    return payload.roles ?? [];
  } catch {
    return [];
  }
}
