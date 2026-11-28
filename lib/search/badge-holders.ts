/**
 * Badge-holder name search, pure and browser-safe (no fs, no network).
 *
 * The public CSV at data/badge-holders/badge-holders.csv is parsed into public fields only. Any
 * column that is not one of PUBLIC_COLUMNS is dropped at parse time, so an email column can never
 * reach the index, the UI or a search. The query typed by a visitor is only ever passed to
 * `matchHolders` in the browser; it is never sent, stored or logged.
 */

export const PUBLIC_COLUMNS = ["name", "organisation", "x_handle", "linkedin", "website", "github", "aliases"] as const;
export type PublicColumn = (typeof PUBLIC_COLUMNS)[number];

export interface BadgeHolder {
  name: string;
  organisation: string;
  /** Lowercase, without a leading @. */
  xHandle: string;
  linkedin: string;
  website: string;
  github: string;
  aliases: string[];
}

export const MIN_QUERY_LENGTH = 2;
export const ALIAS_SEPARATOR = ";";
const MAX_HOLDERS = 5000;

/** RFC 4180 style parser: quoted fields, doubled quotes, CRLF or LF, BOM tolerated. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** "@Alex_Example", "x.com/Alex_Example?s=1" and "https://twitter.com/alex_example/" all become "alex_example". */
export function normalizeHandle(raw: string): string {
  let h = raw.trim();
  h = h.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").replace(/^(www\.)?(x|twitter)\.com\//i, "");
  h = h.split(/[/?#]/)[0] ?? "";
  return h.replace(/^@+/, "").trim().toLowerCase();
}

/** Lowercase, accents and punctuation removed, single spaces. */
export function normalizeText(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const COLUMN_SET = new Set<string>(PUBLIC_COLUMNS);

/**
 * Parses the CSV. Only PUBLIC_COLUMNS are read (header names are matched case-insensitively);
 * every other column, including any email column, is ignored. Rows without a name are skipped.
 */
export function parseBadgeHolderCsv(text: string): BadgeHolder[] {
  const rows = parseCsvRows(text);
  const header = rows[0]?.map((h) => h.trim().toLowerCase());
  if (!header) return [];
  const idx = new Map<PublicColumn, number>();
  header.forEach((h, n) => {
    if (COLUMN_SET.has(h) && !idx.has(h as PublicColumn)) idx.set(h as PublicColumn, n);
  });
  if (!idx.has("name")) return [];
  const cell = (r: string[], c: PublicColumn) => (idx.has(c) ? (r[idx.get(c)!] ?? "").trim() : "");
  const out: BadgeHolder[] = [];
  for (const r of rows.slice(1, MAX_HOLDERS + 1)) {
    const name = cell(r, "name");
    if (!name) continue;
    out.push({
      name,
      organisation: cell(r, "organisation"),
      xHandle: normalizeHandle(cell(r, "x_handle")),
      linkedin: cell(r, "linkedin"),
      website: cell(r, "website"),
      github: cell(r, "github"),
      aliases: cell(r, "aliases")
        .split(ALIAS_SEPARATOR)
        .map((a) => a.trim())
        .filter(Boolean),
    });
  }
  return out;
}

/** Optimal string alignment distance (insert, delete, replace, swap of neighbors each cost 1). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      cur[j] = v;
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[n]!;
}

/** Allowed typos by query length: none up to 3 characters, one up to 7, two beyond. */
export const allowedTypos = (len: number) => (len <= 3 ? 0 : len <= 7 ? 1 : 2);

/** 0 exact, 1 prefix, 2 typo; null no match. */
function tokenRank(q: string, t: string): 0 | 1 | 2 | null {
  if (q === t) return 0;
  if (q.length >= 2 && t.startsWith(q)) return 1;
  const typos = allowedTypos(q.length);
  if (typos > 0 && editDistance(q, t) <= typos) return 2;
  if (typos > 0 && t.length > q.length && editDistance(q, t.slice(0, q.length)) <= typos) return 2;
  return null;
}

function phraseRank(qTokens: string[], candidate: string): number | null {
  const tTokens = candidate.split(" ").filter(Boolean);
  let worst = 0;
  for (const q of qTokens) {
    let best: number | null = null;
    for (const t of tTokens) {
      const r = tokenRank(q, t);
      if (r !== null && (best === null || r < best)) best = r;
    }
    if (best === null) return null;
    worst = Math.max(worst, best);
  }
  // A whole-phrase equality is the strongest match.
  return worst === 0 && qTokens.join(" ") === candidate ? 0 : worst === 0 ? 1 : worst + 1;
}

export interface HolderMatch {
  holder: BadgeHolder;
  /** Lower is closer. 0 means the query equals the name, an alias or the X handle. */
  rank: number;
}

/**
 * Case-insensitive, typo-tolerant match on name, aliases and X handle (with or without @).
 * Order is by closeness, then alphabetical by name; it is not a score shown to anyone. Exact
 * matches hide near misses.
 */
export function matchHolders(holders: readonly BadgeHolder[], query: string): HolderMatch[] {
  const handleQ = normalizeHandle(query);
  const textQ = normalizeText(query);
  if (textQ.length < MIN_QUERY_LENGTH && handleQ.length < MIN_QUERY_LENGTH) return [];
  // A leading @ means the visitor typed a handle: names and aliases are not searched.
  const handleOnly = query.trim().startsWith("@");
  const qTokens = handleOnly ? [] : textQ.split(" ").filter(Boolean);
  const out: HolderMatch[] = [];
  for (const h of holders) {
    let rank: number | null = null;
    const take = (r: number | null) => {
      if (r !== null && (rank === null || r < rank)) rank = r;
    };
    for (const c of [h.name, ...h.aliases]) take(qTokens.length ? phraseRank(qTokens, normalizeText(c)) : null);
    if (h.xHandle && handleQ) {
      if (h.xHandle === handleQ) take(0);
      else if (handleQ.length >= 3) take(tokenRank(handleQ, h.xHandle) === null ? null : 2);
    }
    if (rank !== null) out.push({ holder: h, rank });
  }
  // When something equals the query exactly, near misses are noise: show only the exact matches.
  const exact = out.filter((m) => m.rank === 0);
  return (exact.length ? exact : out).sort((a, b) => a.rank - b.rank || a.holder.name.localeCompare(b.holder.name));
}

/** A single exact match may be shown without a pick; anything else needs the visitor to choose. */
export function canShowDirectly(matches: readonly HolderMatch[]): boolean {
  return matches.length === 1 && matches[0]!.rank === 0;
}
