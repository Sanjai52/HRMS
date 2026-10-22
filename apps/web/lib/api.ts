import { ApiError, defaultUserMessage, statusKind } from "./errors";

export interface ResponseMeta {
  partial?: boolean;
  unavailable?: string[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

function csrfToken(): string | null {
  return typeof window !== "undefined" ? sessionStorage.getItem("hrms_csrf") : null;
}

function technicalFrom(cause: unknown): string | undefined {
  if (cause instanceof Error && cause.message) return cause.message;
  if (typeof cause === "string" && cause) return cause;
  return undefined;
}

function networkError(cause: unknown): ApiError {
  return new ApiError("network", 0, {
    userMessage: defaultUserMessage("network"),
    technicalMessage: technicalFrom(cause),
  });
}

interface ErrorEnvelope {
  error?: { code?: unknown; message?: unknown };
}

/**
 * Read the failure body safely and keep only machine facts (status, code and
 * raw text) in `technicalMessage`. The backend `message` is never used as
 * user-facing copy.
 */
async function readFailure(res: Response): Promise<{ code?: string; technicalMessage: string }> {
  const body = (await res.json().catch(() => null)) as ErrorEnvelope | null;
  const rawCode = body?.error?.code;
  const code = typeof rawCode === "string" && rawCode.trim() ? rawCode : undefined;
  const backendMessage = typeof body?.error?.message === "string" ? body.error.message : undefined;
  const technicalMessage = [`HTTP ${res.status}`, code, backendMessage]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  return { code, technicalMessage };
}

/**
 * The single HTTP core. Every failure is an `ApiError` with safe copy; no
 * backend text and no internal failure string ever leaves this function.
 */
export async function requestJson<T>(
  path: string,
  init?: RequestInit,
  token?: string | null
): Promise<{ data: T; meta?: ResponseMeta }> {
  const csrf = csrfToken();

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(csrf ? { "x-csrf-token": csrf } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (cause) {
    // Native fetch rejection (offline, DNS, CORS, abort): classify, never
    // forward the browser's raw network failure text.
    throw networkError(cause);
  }

  if (!res.ok) {
    const { code, technicalMessage } = await readFailure(res);
    const kind = statusKind(res.status);
    throw new ApiError(kind, res.status, {
      code,
      userMessage: defaultUserMessage(kind),
      technicalMessage,
    });
  }

  let body: { data?: T; meta?: ResponseMeta } | null = null;
  try {
    body = (await res.json()) as { data?: T; meta?: ResponseMeta };
  } catch (cause) {
    throw new ApiError("unknown", res.status, {
      userMessage: defaultUserMessage("unknown"),
      technicalMessage: technicalFrom(cause),
    });
  }
  if (!body || typeof body !== "object") {
    throw new ApiError("unknown", res.status, {
      userMessage: defaultUserMessage("unknown"),
      technicalMessage: "Unexpected response shape",
    });
  }
  return { data: body.data as T, meta: body.meta };
}

export async function api<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  return (await requestJson<T>(path, init, token)).data;
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
