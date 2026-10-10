export interface FetchedPage {
  url: string;
  status: number;
  body: string;
}

export interface CrawlerProvider {
  fetch(url: string, timeoutMs: number): Promise<FetchedPage>;
}

export class HttpCrawler implements CrawlerProvider {
  constructor(private portalBase: string) {}

  async fetch(url: string, timeoutMs: number): Promise<FetchedPage> {
    const full = url.startsWith("http") ? url : `${this.portalBase}${url}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(full, { signal: ctrl.signal, redirect: "manual" });
      const body = await res.text();
      return { url: full, status: res.status, body };
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface RawProfile {
  sourceId: string;
  name: string;
  email: string;
  phone: string;
  skills: string[];
  expYears: number;
}

function textOf(html: string, cls: string): string {
  const m = html.match(new RegExp(`class="${cls}"[^>]*>([^<]*)`));
  return m ? m[1].trim() : "";
}

export function parseListingIds(html: string): string[] {
  const ids: string[] = [];
  const re = /data-id="([a-z0-9-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

export function hasNextPage(html: string): boolean {
  return /rel="next"/.test(html);
}

export function parseProfile(html: string, sourceId: string): RawProfile | null {
  const name = textOf(html, "name");
  if (!name) return null;
  const email = textOf(html, "email");
  const phone = textOf(html, "phone");
  const skills = textOf(html, "skills").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 30);
  const expMatch = textOf(html, "exp").match(/(\d+)/);
  return { sourceId, name, email, phone, skills, expYears: expMatch ? Number(expMatch[1]) : 0 };
}

export function normalizeEmail(email: string): string | null {
  const norm = email.trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(norm) ? norm : null;
}

export function fingerprint(p: RawProfile): string {
  return `noid:${p.name.trim().toLowerCase()}|${p.expYears}|${[...p.skills].sort().join(",")}`;
}
