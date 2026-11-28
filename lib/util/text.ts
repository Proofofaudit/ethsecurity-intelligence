/** Text helpers used by extraction, search and comparison. All deterministic. */

const URL_RE = /https?:\/\/[^\s<>()\[\]"'`]+[^\s<>()\[\]"'`.,;:!?*_]/g;
const MD_LINK_RE = /\[([^\]]{1,300})\]\((https?:\/\/[^)\s]+)\)/g;

export interface ExtractedLink {
  url: string;
  text: string | null;
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) if (p.startsWith("utm_")) u.searchParams.delete(p);
    let s = u.toString();
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return url.trim();
  }
}

export function extractLinks(markdown: string): ExtractedLink[] {
  const out = new Map<string, ExtractedLink>();
  for (const m of markdown.matchAll(MD_LINK_RE)) {
    const url = normalizeUrl(m[2] ?? "");
    if (!out.has(url)) out.set(url, { url, text: (m[1] ?? "").trim() || null });
  }
  for (const m of markdown.matchAll(URL_RE)) {
    const url = normalizeUrl(m[0]);
    if (!out.has(url)) out.set(url, { url, text: null });
  }
  return [...out.values()].filter((l) => /^https?:\/\//.test(l.url));
}

export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>]+/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split prose into sentences, keeping list items as their own sentences. */
export function sentences(md: string): string[] {
  const lines = md.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    const plain = stripMarkdown(line);
    for (const s of plain.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)) {
      const t = s.trim();
      if (t.length >= 12) out.push(t);
    }
  }
  return out;
}

const STOP = new Set(
  "a an and are as at be been by can for from has have in into is it its of on or that the their this to was were will with we our you your which who not no but all any each more most other some such than too very can also only per via over under about across after before both do does done during if may must new one two use used using within without would should could these those them they there here what when where how why while rfp rfps milestone milestones then get getting gets matters initiative initiatives grant funding funded fund round".split(
    " ",
  ),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\-\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t));
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Canonical key for organization name comparison: case, punctuation and common suffixes removed. */
export function orgKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(inc|ltd|llc|gmbh|ag|labs?|foundation|team|the|co|corp|corporation|association|collective)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
}
