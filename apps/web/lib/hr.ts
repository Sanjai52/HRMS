import { requestJson, type ResponseMeta } from "./api";

export type { ResponseMeta };

// Kept as re-exports so the pages that import them from `lib/hr` keep working.
export { fmtDay, fmtTime } from "./format";

/** Like `authed`, but returns the response meta too (for partial-result banners). */
export async function authedMeta<T>(
  path: string,
  token?: string,
  init?: RequestInit
): Promise<{ data: T; meta?: ResponseMeta }> {
  const t = token ?? (typeof window !== "undefined" ? sessionStorage.getItem("hrms_token") : null);
  return requestJson<T>(path, init, t);
}

export async function authed<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  return (await authedMeta<T>(path, token, init)).data;
}
