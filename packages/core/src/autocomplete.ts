export const AUTOCOMPLETE_DOMAIN = "org";
export const AUTOCOMPLETE_SCOPE = "all";
export const AUTOCOMPLETE_MAX_PREFIX = 12;
export const AUTOCOMPLETE_TOP_K = 20;

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
