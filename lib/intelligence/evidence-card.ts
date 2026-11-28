/**
 * Evidence card (Item 8): a short, sourced scan of what exists, who funds it and what was not
 * found, for one initiative. Pure function over the published dataset; no network. Every item
 * carries a source label, a source URL and the date it was checked. The same six sections, in the
 * same order, are produced for every initiative; only the items inside them differ.
 */
import type { Dataset, EvidenceStatus, Initiative, Organization, Product, Repository } from "@/lib/domain/schemas";
import { SOURCE_LABELS, type SourceKind } from "@/lib/neutralLanguage";
import { possibleSelfPledge, SELF_PLEDGE_LABEL } from "./self-pledge";

export const EVIDENCE_CARD_SECTIONS = [
  { key: "shipped", title: "Shipped work" },
  { key: "funding", title: "Funding" },
  { key: "prior", title: "Prior funding" },
  { key: "team", title: "Team and track record" },
  { key: "audits", title: "Audits or reviews" },
  { key: "not_found", title: "Not found" },
] as const;
export type EvidenceCardSectionKey = (typeof EVIDENCE_CARD_SECTIONS)[number]["key"];

export const NO_LINKS_TEXT = "No links published in the proposal";
export const NO_RECIPIENT_TEXT = "No designated recipient";
export const ACTIVITY_NOTE = "GitHub stars and commit counts do not measure security quality.";
export const AUDIT_LINK_NOTE = "Linked in the proposal. Which work the report covers was not verified.";
export const CACHE_NOTE = "All checks are cached results from the research run. They are not refreshed when this page loads.";

export interface CardFlag {
  kind: "broken" | "inconclusive" | "self_pledge";
  /** Full sentence including the checked date where one applies. */
  text: string;
  checkedAt: string | null;
}

export interface CardItem {
  key: string;
  label: string;
  value: string;
  /** Money value in integer cents for figure items, otherwise null. */
  amountCents: number | null;
  /** Extra raw facts about the same thing (dates, license, release). */
  details: string[];
  /** The thing itself (site, repository, profile). Null when the item is a statement or a figure. */
  link: string | null;
  sourceKind: SourceKind;
  sourceLabel: string;
  sourceName: string;
  sourceUrl: string;
  checkedAt: string;
  /** Evidence mark shown with a text label; null for "Not found" items. */
  status: EvidenceStatus | null;
  flag: CardFlag | null;
  note: string | null;
}

export interface CardSection {
  key: EvidenceCardSectionKey;
  title: string;
  items: CardItem[];
  /** Shown when the section has no items. */
  emptyText: string;
}

export interface LinkCheck {
  state: "ok" | "broken" | "inconclusive";
  httpStatus: number | null;
  checkedAt: string;
  via: "http" | "github";
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
/** Date as shown in the UI ("Nov 26, 2026", UTC). */
export function cardDate(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? DATE_FMT.format(t) : iso;
}

/** Whole days between a check and the dataset publication; never negative. */
export function ageDays(checkedAt: string, publishedAt: string): number {
  const a = Date.parse(checkedAt);
  const b = Date.parse(publishedAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

/** URL key for lookups: lowercase host, no fragment, no trailing slash. */
export function urlKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return url.trim().replace(/\/+$/, "");
  }
}

const isHttp = (u: string | null | undefined): u is string => !!u && /^https?:\/\//i.test(u);

/** Private contact details are never shown: email, phone, messengers and personal chat links. */
const PRIVATE_HOSTS = new Set(["t.me", "telegram.me", "telegram.dog", "telegram.org", "wa.me", "api.whatsapp.com", "chat.whatsapp.com", "signal.me", "signal.group", "keybase.io"]);
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE = /(?:\+|\b00)\d[\d\s().-]{7,}\d/;
export function isPrivateContact(url: string, text?: string | null): boolean {
  if (/^(mailto|tel|sms|callto|skype|tg|whatsapp|signal):/i.test(url.trim())) return true;
  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase().replace(/^www\./, "");
    path = u.pathname.toLowerCase();
  } catch {
    return true;
  }
  if (PRIVATE_HOSTS.has(host)) return true;
  if ((host === "discord.com" || host === "discordapp.com") && path.startsWith("/users/")) return true;
  if (EMAIL.test(decodeURIComponent(url))) return true;
  if (text && (EMAIL.test(text) || PHONE.test(text))) return true;
  return false;
}

/** Proposal links that name an audit or security review report in the URL path or link text. */
const AUDIT_WORDS = /(^|[^a-z])(audit|security)[\s_-]*(report|reports|summary|summaries|review|reviews)([^a-z]|$)/i;
const AUDIT_SEGMENT = /^(audits|audit-reports|security-reviews|reviews)$/i;
export function isAuditReportLink(url: string, text: string | null): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  // Links to other initiatives on TheDAO's site are proposals, not reports.
  if (u.hostname === "initiatives.thedao.fund") return false;
  let p = u.pathname;
  try {
    p = decodeURIComponent(p);
  } catch {
    // keep the raw path
  }
  return AUDIT_WORDS.test(p) || AUDIT_WORDS.test(text ?? "") || p.split("/").some((s) => AUDIT_SEGMENT.test(s));
}

/** Indexed research checks, built once per dataset. */
interface CheckIndex {
  products: Map<string, Product>;
  http: Map<string, { ok: boolean; inconclusive: boolean; status: number | null; observedAt: string }>;
  repos: Map<string, Repository>;
  profiles: Map<string, { ok: boolean; observedAt: string }>;
}
const indexCache = new WeakMap<Dataset, CheckIndex>();
function checkIndex(d: Dataset): CheckIndex {
  const hit = indexCache.get(d);
  if (hit) return hit;
  const idx: CheckIndex = { products: new Map(), http: new Map(), repos: new Map(), profiles: new Map() };
  for (const p of d.products) idx.products.set(urlKey(p.url), p);
  for (const r of d.repositories) idx.repos.set(urlKey(r.url).toLowerCase(), r);
  for (const e of d.evidence) {
    const k = urlKey(e.url);
    if (e.kind === "http_check") {
      const prev = idx.http.get(k);
      if (prev && prev.observedAt >= e.observedAt) continue;
      const status = typeof e.facts.status === "number" ? e.facts.status : null;
      idx.http.set(k, { ok: e.ok, inconclusive: e.facts.inconclusive === true, status, observedAt: e.observedAt });
    } else if (e.kind === "github_profile") {
      const prev = idx.profiles.get(k.toLowerCase());
      if (!prev || prev.observedAt < e.observedAt) idx.profiles.set(k.toLowerCase(), { ok: e.ok, observedAt: e.observedAt });
    }
  }
  indexCache.set(d, idx);
  return idx;
}

const inconclusiveStatus = (s: number | null) => s === null || s === 403 || s === 429 || s === 503;

export function productCheck(p: Product): LinkCheck {
  const checkedAt = p.checkedAt ?? p.provenance.retrievedAt;
  return { state: p.reachable === true ? "ok" : p.reachable === false ? "broken" : "inconclusive", httpStatus: p.status, checkedAt, via: "http" };
}

export function repositoryCheck(r: Repository): LinkCheck {
  return { state: r.exists ? "ok" : /\b404\b/.test(r.error ?? "") ? "broken" : "inconclusive", httpStatus: r.exists ? 200 : /\b404\b/.test(r.error ?? "") ? 404 : null, checkedAt: r.checkedAt, via: "github" };
}

/** The stored research check for a URL, or null when the pipeline did not check it. */
export function linkCheck(d: Dataset, url: string, org?: Organization | null): LinkCheck | null {
  const idx = checkIndex(d);
  const k = urlKey(url);
  const repo = idx.repos.get(k.toLowerCase());
  if (repo) return repositoryCheck(repo);
  const prod = idx.products.get(k);
  if (prod) return productCheck(prod);
  const h = idx.http.get(k);
  if (h) return { state: h.ok ? "ok" : h.inconclusive ? "inconclusive" : "broken", httpStatus: h.status, checkedAt: h.observedAt, via: "http" };
  const prof = idx.profiles.get(k.toLowerCase());
  if (prof) return { state: prof.ok ? "ok" : "broken", httpStatus: null, checkedAt: prof.observedAt, via: "github" };
  const wc = org?.websiteCheck;
  if (wc && urlKey(wc.url) === k) return { state: wc.ok ? "ok" : inconclusiveStatus(wc.status) ? "inconclusive" : "broken", httpStatus: wc.status, checkedAt: wc.checkedAt, via: "http" };
  return null;
}

/** Flag for a failed or inconclusive check. Broken links are flagged, never hidden. */
export function checkFlag(c: LinkCheck | null, publishedAt: string, kind: "link" | "repository" = "link"): CardFlag | null {
  if (!c || c.state === "ok") return null;
  const date = cardDate(c.checkedAt);
  if (c.state === "broken") {
    const text = kind === "repository" ? `Repository not found when checked on ${date}` : `Link did not respond when checked on ${date}${c.httpStatus ? ` (HTTP ${c.httpStatus})` : ""}`;
    return { kind: "broken", text, checkedAt: c.checkedAt };
  }
  const age = ageDays(c.checkedAt, publishedAt);
  const status = c.httpStatus ? `HTTP ${c.httpStatus}` : "no response";
  return {
    kind: "inconclusive",
    text: `Check inconclusive when checked on ${date} (${status}, bot protection or rate limit). Cached result, ${age === 0 ? "from the publication day" : `${age} ${age === 1 ? "day" : "days"} old at publication`}.`,
    checkedAt: c.checkedAt,
  };
}

const statusOf = (c: LinkCheck | null, fallback: EvidenceStatus): EvidenceStatus => (c ? (c.state === "ok" ? "independently_verified" : "not_independently_verified") : fallback);

/** Raw reachability fact for a successful check, or "Reachability not checked". Failed checks are flags instead. */
export function checkDetails(c: LinkCheck | null): string[] {
  if (!c) return ["Reachability not checked"];
  if (c.state !== "ok") return [];
  return [c.via === "github" ? `Found on GitHub when checked on ${cardDate(c.checkedAt)}` : `Responded${c.httpStatus ? ` (HTTP ${c.httpStatus})` : ""} when checked on ${cardDate(c.checkedAt)}`];
}

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");
}

export interface EvidenceCardOptions {
  fundingIdentity: string;
}

export function buildEvidenceCard(d: Dataset, ini: Initiative, opts: EvidenceCardOptions) {
  const published = d.meta.generatedAt;
  const org = d.organizations.find((o) => o.id === ini.organizationId) ?? null;
  const officialUrl = ini.provenance.sourceUrls[0] ?? ini.url;
  const officialAt = ini.provenance.retrievedAt;
  const base = (kind: SourceKind) => ({ sourceKind: kind, sourceLabel: SOURCE_LABELS[kind] });
  const official = { ...base("official"), sourceName: "TheDAO API record", sourceUrl: officialUrl, checkedAt: officialAt };
  const proposal = { ...base("applicant"), sourceName: "Official proposal", sourceUrl: ini.url, checkedAt: officialAt };
  /** A search of the official proposal record that found nothing is a fact about the official record. */
  const searched = { ...base("official"), sourceName: "Official proposal", sourceUrl: ini.url, checkedAt: officialAt };
  const item = (x: Partial<CardItem> & Pick<CardItem, "key" | "label" | "value" | "sourceKind" | "sourceLabel" | "sourceName" | "sourceUrl" | "checkedAt">): CardItem => ({
    amountCents: null,
    details: [],
    link: null,
    status: null,
    flag: null,
    note: null,
    ...x,
  });

  const allLinks = [...ini.links.map((url) => ({ url, text: null as string | null, section: "links" })), ...ini.textLinks];
  const seen = new Set<string>();
  const uniqueLinks = allLinks.filter((l) => {
    const k = urlKey(l.url);
    if (seen.has(k)) return false;
    seen.add(k);
    return isHttp(l.url);
  });
  const notFound: CardItem[] = [];
  const missing = (key: string, value: string, src: Pick<CardItem, "sourceKind" | "sourceLabel" | "sourceName" | "sourceUrl" | "checkedAt">) => notFound.push(item({ key: `nf_${key}`, label: "Not found", value, ...src }));
  if (allLinks.length === 0) missing("links", NO_LINKS_TEXT, searched);

  // 1. Shipped work
  const shipped: CardItem[] = [];
  const siteKey = ini.recipientUrl ? urlKey(ini.recipientUrl) : null;
  if (ini.recipientUrl && isHttp(ini.recipientUrl)) {
    const c = linkCheck(d, ini.recipientUrl, org);
    shipped.push(
      item({
        key: "site",
        label: "Official site",
        value: shortUrl(ini.recipientUrl),
        link: ini.recipientUrl,
        ...official,
        details: checkDetails(c),
        status: "officially_reported",
        flag: checkFlag(c, published),
      }),
    );
  } else {
    missing("site", "No official site in the official record", official);
  }
  for (const p of d.products.filter((x) => x.initiativeIds.includes(ini.id) && urlKey(x.url) !== siteKey).sort((a, b) => a.url.localeCompare(b.url))) {
    const c = productCheck(p);
    shipped.push(
      item({
        key: `product_${p.id}`,
        label: "Linked site or product",
        value: p.title && p.title !== "Just a moment..." ? `${p.title} (${shortUrl(p.url)})` : shortUrl(p.url),
        link: p.url,
        ...base("independent"),
        sourceName: "HTTP check",
        sourceUrl: p.url,
        checkedAt: c.checkedAt,
        details: checkDetails(c),
        status: statusOf(c, "independently_verified"),
        flag: checkFlag(c, published),
      }),
    );
  }
  const maintained = new Set(d.relationships.filter((r) => r.type === "maintains" && r.from.id === ini.organizationId).map((r) => r.to.id));
  const repos = d.repositories.filter((r) => r.initiativeIds.includes(ini.id)).sort((a, b) => a.fullName.localeCompare(b.fullName));
  let activityShown = false;
  for (const r of repos) {
    const c = repositoryCheck(r);
    const details: string[] = [];
    if (r.exists) {
      details.push(maintained.has(r.id) ? "Owner matches the recipient's GitHub account" : "Cited in the proposal");
      details.push(r.pushedAt ? `Last push ${cardDate(r.pushedAt)}` : "Last push not reported");
      details.push(r.latestRelease ? `Latest release ${r.latestRelease.tag}${r.latestRelease.publishedAt ? ` (${cardDate(r.latestRelease.publishedAt)})` : ""}${r.releaseCount !== null ? `, ${r.releaseCount} ${r.releaseCount === 1 ? "release" : "releases"}` : ""}` : "No release published");
      details.push(r.license ? `License ${r.license}` : "No license file detected");
      if (r.archived) details.push("Archived");
      if (r.commitsLast90d !== null) {
        details.push(`${r.commitsLast90d} ${r.commitsLast90d === 1 ? "commit" : "commits"} in the 90 days before the check`);
        activityShown = true;
      }
    }
    shipped.push(
      item({
        key: `repo_${r.id}`,
        label: "Repository",
        value: r.fullName,
        link: r.url,
        ...base("independent"),
        sourceName: "GitHub API",
        sourceUrl: r.url,
        checkedAt: r.checkedAt,
        details,
        status: statusOf(c, "independently_verified"),
        flag: checkFlag(c, published, "repository"),
        note: c.state === "inconclusive" ? (r.error ?? null) : null,
      }),
    );
  }
  const liveRepos = repos.filter((r) => r.exists);
  const newestRepoCheck = repos.map((r) => r.checkedAt).sort().pop();
  const githubSrc = (r: Repository | undefined) => ({ ...base("independent"), sourceName: "GitHub API", sourceUrl: r?.url ?? ini.url, checkedAt: newestRepoCheck ?? officialAt });
  if (repos.length === 0) missing("repo", "No public repository linked", searched);
  else if (liveRepos.length === 0) missing("repo", "No linked repository was found on GitHub", githubSrc(repos[0]));
  else {
    if (!liveRepos.some((r) => r.latestRelease)) missing("release", "No release published", githubSrc(liveRepos[0]));
    if (!liveRepos.some((r) => r.license)) missing("license", "No license file detected", githubSrc(liveRepos[0]));
  }

  // 2. Funding: three separate official figures, never merged.
  const f = ini.funding;
  const funding: CardItem[] = [
    item({ key: "pledged", label: "Pledged (outstanding)", value: "", amountCents: f.pledgedCents, ...official, status: "officially_reported" }),
    item({ key: "received", label: "Received pledges", value: "", amountCents: f.receivedCents, ...official, status: "officially_reported", note: "Already inside donated" }),
    item({ key: "donated", label: "Donated (confirmed)", value: "", amountCents: f.donatedCents, ...official, status: "officially_reported", note: opts.fundingIdentity }),
  ];
  const pledges = d.pledges.filter((p) => p.initiativeId === ini.id).sort((a, b) => a.company.localeCompare(b.company) || a.id.localeCompare(b.id));
  for (const p of pledges) {
    const sp = possibleSelfPledge(p.company, { recipientTeam: ini.recipientTeam, organization: org });
    funding.push(
      item({
        key: `pledge_${p.id}`,
        label: p.status === "received" ? "Backer (received)" : "Backer (pledged)",
        value: p.company,
        amountCents: p.amountCents,
        link: isHttp(p.url) ? p.url : null,
        ...base("official"),
        sourceName: "TheDAO API pledge record",
        sourceUrl: p.provenance.sourceUrls[0] ?? officialUrl,
        checkedAt: p.provenance.retrievedAt,
        status: "officially_reported",
        flag: sp.flagged ? { kind: "self_pledge", text: SELF_PLEDGE_LABEL, checkedAt: p.provenance.retrievedAt } : null,
      }),
    );
  }
  if (pledges.length === 0) missing("backers", "No named backers in the official record", official);

  // 3. Prior funding
  const prior: CardItem[] = [];
  const r1 = d.round1;
  const r1m = r1.initiativeMatches[ini.id] ?? [];
  const r1Match = r1m.filter((m) => m.status === "match").length;
  const r1Possible = r1m.filter((m) => m.status === "possible").length;
  const r1Src = { ...base("independent"), sourceName: "TheDAO transparency report", sourceUrl: r1.transparencyUrl, checkedAt: r1.checkedAt ?? published };
  if (r1.status !== "unavailable" && r1m.length > 0) {
    const parts = [r1Match ? `${r1Match} ${r1Match === 1 ? "match" : "matches"}` : null, r1Possible ? `${r1Possible} possible ${r1Possible === 1 ? "match" : "matches"}, please verify` : null].filter(Boolean);
    prior.push(item({ key: "round1", label: "Round 1", value: `See Round 1 history: ${r1m.length} ${r1m.length === 1 ? "record" : "records"} (${parts.join(", ")})`, link: "#round1", ...r1Src, status: r1Match ? "independently_verified" : "not_independently_verified" }));
  } else if (r1.status === "unavailable") {
    prior.push(item({ key: "round1", label: "Round 1", value: "Round 1 records are unavailable because the sources could not be read.", link: "#round1", ...r1Src }));
  }
  for (const g of d.previousGrants.filter((x) => x.initiativeId === ini.id)) {
    prior.push(
      item({
        key: `pg_${g.id}`,
        label: g.funder === "Not identified" ? "Funding statement in the proposal" : `Funding statement: ${g.funder}`,
        value: g.statement,
        amountCents: g.amountCents,
        ...base("applicant"),
        sourceName: "Official proposal",
        sourceUrl: g.sourceUrls[0] ?? ini.url,
        checkedAt: g.provenance.retrievedAt,
        status: g.status,
      }),
    );
  }
  if (r1.status !== "unavailable" && r1m.length === 0) missing("round1", "No Round 1 funding found in the sources checked", r1Src);
  if (!d.previousGrants.some((x) => x.initiativeId === ini.id)) missing("prior", "No prior-funding statement found in the proposal", searched);

  // 4. Team and track record
  const team: CardItem[] = [];
  if (!ini.recipientTeam && !org) {
    team.push(item({ key: "recipient", label: "Recipient", value: NO_RECIPIENT_TEXT, ...official, status: "officially_reported" }));
  } else {
    team.push(item({ key: "recipient", label: "Recipient team", value: ini.recipientTeam ?? org?.name ?? "", ...official, status: "officially_reported" }));
  }
  const shownProfiles = new Set<string>();
  for (const p of d.people.filter((x) => x.initiativeIds.includes(ini.id)).sort((a, b) => a.name.localeCompare(b.name))) {
    for (const u of p.publicProfiles) {
      if (!isHttp(u) || isPrivateContact(u, null) || shownProfiles.has(urlKey(u))) continue;
      shownProfiles.add(urlKey(u));
      const c = linkCheck(d, u, org);
      team.push(
        item({
          key: `person_${p.id}_${shownProfiles.size}`,
          label: "Public profile",
          value: `${p.name}${p.role ? `, ${p.role}` : ""} (${shortUrl(u)})`,
          link: u,
          ...proposal,
          details: checkDetails(c),
          status: "applicant_reported",
          flag: checkFlag(c, published),
        }),
      );
    }
  }
  for (const l of ini.textLinks.filter((x) => x.section === "team")) {
    if (!isHttp(l.url) || isPrivateContact(l.url, l.text) || shownProfiles.has(urlKey(l.url))) continue;
    shownProfiles.add(urlKey(l.url));
    const c = linkCheck(d, l.url, org);
    team.push(
      item({
        key: `teamlink_${shownProfiles.size}`,
        label: "Linked in the team section",
        value: l.text && l.text !== l.url ? `${l.text} (${shortUrl(l.url)})` : shortUrl(l.url),
        link: l.url,
        ...proposal,
        details: checkDetails(c),
        status: "applicant_reported",
        flag: checkFlag(c, published),
      }),
    );
  }
  const gp = org?.githubProfile;
  if (gp && !shownProfiles.has(urlKey(gp.url))) {
    const c = linkCheck(d, gp.url, org);
    if (c) {
      shownProfiles.add(urlKey(gp.url));
      team.push(
        item({
          key: "org_github",
          label: "GitHub account",
          value: `${gp.login}${gp.publicRepos !== null ? `, ${gp.publicRepos} public ${gp.publicRepos === 1 ? "repository" : "repositories"}` : ""}${gp.createdAt ? `, created ${cardDate(gp.createdAt)}` : ""}`,
          link: gp.url,
          ...base("independent"),
          sourceName: "GitHub API",
          sourceUrl: gp.url,
          checkedAt: c.checkedAt,
          status: statusOf(c, "independently_verified"),
          flag: checkFlag(c, published),
        }),
      );
    }
  }
  if ((ini.recipientTeam || org) && team.length === 1) missing("team", "No public team profile linked in the proposal", searched);

  // 5. Audits or reviews: only links to a public report.
  const audits: CardItem[] = [];
  for (const l of uniqueLinks) {
    if (!isAuditReportLink(l.url, l.text)) continue;
    const c = linkCheck(d, l.url, org);
    audits.push(
      item({
        key: `audit_${audits.length + 1}`,
        label: "Report linked in the proposal",
        value: l.text && l.text !== l.url ? `${l.text} (${shortUrl(l.url)})` : shortUrl(l.url),
        link: l.url,
        ...proposal,
        details: checkDetails(c),
        status: "applicant_reported",
        flag: checkFlag(c, published, c?.via === "github" ? "repository" : "link"),
        note: AUDIT_LINK_NOTE,
      }),
    );
  }
  if (audits.length === 0) missing("audit", "No public audit report linked", searched);

  const byKey: Record<EvidenceCardSectionKey, CardItem[]> = { shipped, funding, prior, team, audits, not_found: notFound };
  const sections: CardSection[] = EVIDENCE_CARD_SECTIONS.map((s) => ({ key: s.key, title: s.title, items: byKey[s.key], emptyText: "Not found" }));
  const checks = sections.flatMap((s) => s.items.map((i) => i.checkedAt)).sort();
  return {
    initiativeId: ini.id,
    slug: ini.slug,
    sections,
    activityNote: activityShown ? ACTIVITY_NOTE : null,
    cacheNote: CACHE_NOTE,
    publishedAt: published,
    oldestCheck: checks[0] ?? published,
    newestCheck: checks[checks.length - 1] ?? published,
    flags: {
      broken: sections.flatMap((s) => s.items).filter((i) => i.flag?.kind === "broken").length,
      inconclusive: sections.flatMap((s) => s.items).filter((i) => i.flag?.kind === "inconclusive").length,
      selfPledge: funding.filter((i) => i.flag?.kind === "self_pledge").length,
    },
  };
}
export type EvidenceCard = ReturnType<typeof buildEvidenceCard>;

/** One-line Research summary computed from the same card. */
export function evidenceCardRow(card: EvidenceCard) {
  const sec = (k: EvidenceCardSectionKey) => card.sections.find((s) => s.key === k)?.items ?? [];
  const shipped = sec("shipped");
  const repos = shipped.filter((i) => i.key.startsWith("repo_"));
  const site = shipped.find((i) => i.key === "site") ?? null;
  const funding = sec("funding");
  const fig = (k: string) => funding.find((i) => i.key === k)?.amountCents ?? null;
  const round1 = sec("prior").find((i) => i.key === "round1") ?? null;
  const reposLinked = repos.length;
  const reposFound = repos.filter((i) => i.flag === null).length;
  const siteState = site ? (site.flag?.kind === "broken" ? "did_not_respond" : site.flag?.kind === "inconclusive" ? "inconclusive" : site.details[0] === "Reachability not checked" ? "not_checked" : "responded") : "none";
  const pledgedCents = fig("pledged");
  const receivedCents = fig("received");
  const donatedCents = fig("donated");
  const round1State = round1 ? (round1.status === "independently_verified" ? "match" : round1.status === "not_independently_verified" ? "possible" : "unavailable") : "none";
  const auditReports = sec("audits").length;
  const SITE_TEXT = { responded: "site responded", did_not_respond: "site did not respond", inconclusive: "site check inconclusive", not_checked: "site not checked", none: "no official site" } as const;
  const ROUND1_TEXT = { match: "Round 1: match", possible: "Round 1: possible match", unavailable: "Round 1: unavailable", none: "Round 1: none found" } as const;
  const parts = [
    reposLinked === 0 ? "No repository linked" : `${reposLinked} ${reposLinked === 1 ? "repository" : "repositories"} linked${reposFound < reposLinked ? ` (${reposLinked - reposFound} not found or not checked)` : ""}`,
    SITE_TEXT[siteState],
    "Funding figures: see TheDAO",
    ROUND1_TEXT[round1State],
    auditReports ? `${auditReports} audit or review ${auditReports === 1 ? "report" : "reports"} linked` : "Audit reports: Not found",
  ];
  if (card.flags.selfPledge) parts.push(`${card.flags.selfPledge} possible self-${card.flags.selfPledge === 1 ? "pledge" : "pledges"}, unverified`);
  return {
    reposLinked,
    reposFound,
    site: siteState,
    pledgedCents,
    receivedCents,
    donatedCents,
    round1: round1State,
    auditReports,
    possibleSelfPledges: card.flags.selfPledge,
    brokenLinks: card.flags.broken,
    newestCheck: card.newestCheck,
    parts,
  };
}
export type EvidenceCardRow = ReturnType<typeof evidenceCardRow>;
