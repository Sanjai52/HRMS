export const AUTOCOMPLETE_DOMAIN = "org";
export const AUTOCOMPLETE_SCOPE = "all";
export const AUTOCOMPLETE_MAX_PREFIX = 12;
export const AUTOCOMPLETE_TOP_K = 20;
export const AUTOCOMPLETE_TTL_SECONDS = 7 * 24 * 3600;

// Public-jobs scope (PRD §9.8): same rules as the org directory, separate key space.
export const JOBS_AUTOCOMPLETE_DOMAIN = "jobs";
export const JOBS_AUTOCOMPLETE_SCOPE = "public";

export function normalizePrefix(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

export function prefixesFor(text: string, maxLen: number = AUTOCOMPLETE_MAX_PREFIX): string[] {
  const norm = normalizePrefix(text);
  const out: string[] = [];
  for (let i = 1; i <= Math.min(norm.length, maxLen); i++) out.push(norm.slice(0, i));
  return out;
}

export function suggestKey(prefix: string): string {
  return `autocomplete:${AUTOCOMPLETE_DOMAIN}:${AUTOCOMPLETE_SCOPE}:${normalizePrefix(prefix)}`;
}

export function suggestMember(employeeId: string, name: string, department: string): string {
  return `${employeeId}|${name}|${department}`;
}

export function parseSuggestMember(member: string): { employeeId: string; name: string; department: string } {
  const [employeeId = "", name = "", department = ""] = member.split("|");
  return { employeeId, name, department };
}

export function jobsSuggestKey(prefix: string): string {
  return `autocomplete:${JOBS_AUTOCOMPLETE_DOMAIN}:${JOBS_AUTOCOMPLETE_SCOPE}:${normalizePrefix(prefix)}`;
}

export function jobSuggestMember(jobId: string, title: string, slug: string): string {
  return `${jobId}|${title}|${slug}`;
}

export function parseJobSuggestMember(member: string): { jobId: string; title: string; slug: string } {
  const [jobId = "", title = "", slug = ""] = member.split("|");
  return { jobId, title, slug };
}
