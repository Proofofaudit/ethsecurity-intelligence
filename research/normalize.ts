/**
 * Normalise a validated official snapshot into canonical official-layer records.
 * Nothing here is research: every value is copied or deterministically derived from
 * TheDAO Security Fund API responses, and carries origin "official" or "derived".
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import type { DetailResponse, ListResponse, RevisionResponse } from "@/lib/official/schemas";
import type { Donation, Initiative, Milestone, Organization, OrganizationAlias, Person, Pledge, Provenance, Revision } from "@/lib/domain/schemas";
import { classifyStages, extractStandards } from "@/lib/domain/taxonomy";
import { resolveIdentities, type CuratedAlias, type NameRecord } from "@/lib/domain/identity";
import { toCents } from "@/lib/util/money";
import { contentHash, stableId } from "@/lib/util/hash";
import { extractLinks, slugify } from "@/lib/util/text";
import { officialUrls } from "@/lib/official/client";
import { DATA_DIR, REVISIONS_DIR, readJson, readObject, type SnapshotManifest } from "./store";
import { loadCohort } from "./ingest";

export const NORMALIZER_VERSION = "normalize@1";

export interface OfficialLayer {
  manifest: SnapshotManifest;
  ballot: ListResponse;
  initiatives: Initiative[];
  milestones: Milestone[];
  pledges: Pledge[];
  donations: Donation[];
  organizations: Organization[];
  aliases: OrganizationAlias[];
  people: Person[];
  revisions: Revision[];
  details: Map<string, DetailResponse>;
}

const tsToIso = (t: number | null | undefined): string | null => (t ? new Date(t * 1000).toISOString() : null);

const DEPENDENCY_TERMS = [
  "integrat",
  "adopt",
  "partner",
  "upstream",
  "merged into",
  "accepted by",
  "listed by",
  "agreement",
  "sign up",
  "onboard",
  "deployed by",
  "used by",
  "at least",
  "wallets",
  "protocols",
  "clients",
  "teams",
];

export function milestoneQuestions(m: { name: string; amountCents: number; adoption: boolean; done: boolean; targetMonth: string | null; link: string | null; criteria: string[] }, goalCents: number) {
  const qs: { code: string; question: string }[] = [];
  const crit = m.criteria.join(" ").trim();
  if (m.criteria.length === 0) qs.push({ code: "no_criteria", question: "What objective evidence will show this milestone is complete?" });
  else if (crit.length < 40) qs.push({ code: "short_criteria", question: "The acceptance criterion is brief. What specific, checkable outcome defines completion?" });
  if (m.adoption) qs.push({ code: "adoption_dependency", question: "Which third parties must adopt this deliverable, and have any confirmed publicly?" });
  if (!m.done && !m.targetMonth) qs.push({ code: "no_target_month", question: "No target month is recorded. When is this milestone expected?" });
  if (goalCents > 0 && m.amountCents / goalCents > 0.5) qs.push({ code: "concentrated_budget", question: "Over half of the budget sits in this milestone. What intermediate checkpoints exist?" });
  if (m.done && !m.link) qs.push({ code: "done_without_link", question: "Marked complete without a linked artifact. Where can completion be inspected?" });
  if (/\b(\d+|ten|five|three|twenty|fifty|hundred)\b/i.test(crit) && /(users|wallets|protocols|teams|projects|integrations|downloads|installs)/i.test(crit) && m.adoption)
    qs.push({ code: "numeric_adoption_target", question: "The criterion sets a numeric adoption target. How will the count be measured and verified?" });
  return qs;
}

function shortTitle(title: string): string {
  const idx = title.indexOf(":");
  if (idx > 0) {
    const prefix = title.slice(0, idx).trim();
    if (prefix.toUpperCase() === "RFP") {
      const rest = title.slice(idx + 1).trim();
      return rest.length > 56 ? `${rest.slice(0, 55).trimEnd()}…` : rest;
    }
    if (prefix.length <= 32) return prefix;
  }
  return title.length > 56 ? `${title.slice(0, 55).trimEnd()}…` : title;
}

const SECTION_HEADINGS: Record<string, string> = {
  why: "Why this matters",
  in_scope: "In scope",
  out_scope: "Out of scope",
  team: "Team",
  why_grant: "Why this team / prior work",
  commitments: "Commitments",
  requirements: "Requirements",
  deliverables: "Deliverables",
  evaluation: "Evaluation",
};

export async function normalize(manifest: SnapshotManifest): Promise<OfficialLayer> {
  const cohort = await loadCohort();
  if (!cohort) throw new Error("No frozen cohort; run ingestion first.");
  const ballot = await readObject<ListResponse>(manifest.ballotObject);
  const listBySlug = new Map(ballot.initiatives.map((i) => [i.slug, i]));
  const categoryLabels = new Map<string, string>();
  for (const i of ballot.initiatives) for (const c of i.categories) categoryLabels.set(c.slug, c.label);
  const cohortIds = new Set(cohort.members.map((m) => m.id));
  const ballotIds = new Set<string>();

  const details = new Map<string, DetailResponse>();
  for (const [slug, entry] of Object.entries(manifest.initiatives)) {
    const d = await readObject<DetailResponse>(entry.detail);
    details.set(d.initiative.id, d);
    if (listBySlug.has(slug)) ballotIds.add(d.initiative.id);
  }

  const prov = (method: string, sourceUrls: string[], retrievedAt: string, origin: Provenance["origin"] = "official"): Provenance => ({
    origin,
    sourceUrls,
    retrievedAt,
    method,
    version: NORMALIZER_VERSION,
  });

  const initiatives: Initiative[] = [];
  const milestones: Milestone[] = [];
  const pledges: Pledge[] = [];
  const donations: Donation[] = [];
  const nameRecords: NameRecord[] = [];
  const people = new Map<string, Person>();

  for (const member of cohort.members) {
    const d = details.get(member.id);
    if (!d) throw new Error(`Cohort member ${member.slug} missing from snapshot`);
    const i = d.initiative;
    const entry = manifest.initiatives[i.slug];
    const retrievedAt = entry?.detailFetchedAt ?? manifest.createdAt;
    const list = listBySlug.get(i.slug);
    const apiUrl = officialUrls.initiative(i.slug);
    const goalCents = toCents(i.goalUsd);
    const pledgedCents = toCents(d.summary.pledged);
    const donatedCents = toCents(d.summary.donated);
    const officialRaisedCents = toCents(d.summary.total);
    const sectionOrder = list?.sections.map((s) => s.key) ?? Object.keys(i.sections);
    const sections = sectionOrder
      .filter((k) => typeof i.sections[k] === "string")
      .map((k) => ({ key: k, heading: list?.sections.find((s) => s.key === k)?.heading ?? SECTION_HEADINGS[k] ?? k, markdown: i.sections[k] as string }));
    if (i.details && sections.length === 0) sections.push({ key: "details", heading: "Proposal", markdown: i.details });
    const textLinks = sections.flatMap((s) => extractLinks(s.markdown).map((l) => ({ ...l, section: s.key })));
    for (const [idx, m] of i.milestones.entries()) for (const l of extractLinks([m.link, ...m.criteria].join("\n"))) textLinks.push({ ...l, section: `milestone:${idx}` });
    const dedupLinks = [...new Map(textLinks.map((l) => [`${l.url}|${l.section}`, l])).values()];
    const categorySlugs = i.categories.map((c) => (typeof c === "string" ? c : c.slug));
    const fullText = [i.title, i.summary, ...sections.map((s) => s.markdown), ...i.milestones.flatMap((m) => [m.name, ...m.criteria])].join("\n");
    const onBallotList = ballotIds.has(i.id);
    let eligibilityNote: string | null = null;
    if (!onBallotList) eligibilityNote = "No longer returned by the official ballot list since the cohort was frozen. Kept for transparency.";
    else if (!d.onBallot) eligibilityNote = "Returned by the ballot list, but the initiative endpoint reports onBallot=false.";

    const base = {
      id: i.id,
      slug: i.slug,
      title: i.title,
      shortTitle: shortTitle(i.title),
      type: i.type,
      url: officialUrls.page(i.slug),
      markdownUrl: list?.markdownUrl ?? `${officialUrls.page(i.slug)}.md`,
      summary: i.summary,
      categories: categorySlugs.map((s) => ({ slug: s, label: categoryLabels.get(s) ?? s })),
      listStatus: list?.status ?? "not_listed",
      approvalStatus: i.status,
      onBallot: d.onBallot && onBallotList,
      cohortMember: cohortIds.has(i.id),
      eligibilityNote,
      recipientTeam: i.recipientTeam?.trim() || null,
      recipientUrl: i.recipientUrl?.trim() || null,
      organizationId: null as string | null,
      durationMonths: i.durationMonths ?? null,
      topup: i.topup,
      milestoneReviewer: i.milestoneReviewer?.trim() || null,
      discourseUrl: i.discourseUrl?.trim() || null,
      safeAddress: i.safeAddress ?? null,
      approvedAt: tsToIso(i.approvedAt),
      createdAt: tsToIso(i.createdAt),
      revision: i.revision ?? null,
      structured: i.structured ?? false,
      sections,
      links: i.links,
      textLinks: dedupLinks,
      funding: {
        goalCents,
        officialRaisedCents,
        pledgedCents,
        receivedCents: toCents(d.summary.received),
        donatedCents,
        paidOutCents: toCents(d.summary.paidOut ?? 0),
        ledgerCents: d.summary.ledger === null || d.summary.ledger === undefined ? null : toCents(d.summary.ledger),
        live: d.summary.live ?? null,
        officialPct: d.pct ?? list?.pctFunded ?? null,
        remainingCents: Math.max(0, goalCents - officialRaisedCents),
        ledgerCheckedAt: tsToIso(d.ledger?.checkedAt ?? null),
      },
      stages: classifyStages(fullText, categorySlugs),
      standards: extractStandards(fullText),
      commentCount: null as number | null,
      provenance: prov("TheDAO API initiative endpoint, schema-validated", [apiUrl, officialUrls.page(i.slug)], retrievedAt),
    };
    if (entry?.comments) {
      try {
        const c = await readObject<{ entries: unknown[] }>(entry.comments);
        base.commentCount = c.entries.length;
      } catch {
        base.commentCount = null;
      }
    }
    initiatives.push({ ...base, contentHash: contentHash({ t: base.title, s: base.summary, sec: base.sections, m: i.milestones, g: goalCents, l: base.links }) });

    for (const [idx, m] of i.milestones.entries()) {
      const amountCents = toCents(m.amount);
      const rec = {
        name: m.name.trim(),
        amountCents,
        adoption: m.adoption,
        done: m.done,
        targetMonth: m.month?.trim() || null,
        link: m.link?.trim() || null,
        criteria: m.criteria.map((c) => c.trim()).filter(Boolean),
      };
      const critLower = rec.criteria.join(" ").toLowerCase();
      milestones.push({
        id: stableId("ms", i.id, String(idx)),
        initiativeId: i.id,
        index: idx,
        ...rec,
        shareOfGoal: goalCents > 0 ? amountCents / goalCents : null,
        questions: milestoneQuestions(rec, goalCents),
        dependencyTerms: DEPENDENCY_TERMS.filter((t) => critLower.includes(t)),
        provenance: prov("TheDAO API milestone record", [apiUrl], retrievedAt),
      });
    }

    for (const p of d.pledges) {
      nameRecords.push({ name: p.company, url: p.url || null, role: "backer", initiativeId: i.id, ref: p.id });
      pledges.push({
        id: p.id,
        initiativeId: i.id,
        backerId: "",
        company: p.company.trim(),
        amountCents: toCents(p.amountUsd),
        status: p.status,
        url: p.url || null,
        note: p.note || null,
        createdAt: tsToIso(p.createdAt ?? null),
        provenance: prov("TheDAO API pledge record (admin-entered)", [apiUrl], retrievedAt),
      });
    }
    if (base.recipientTeam) nameRecords.push({ name: base.recipientTeam, url: base.recipientUrl, role: "recipient", initiativeId: i.id, ref: i.id });

    for (const dn of d.donations) {
      donations.push({
        id: stableId("dn", i.id, dn.txHash),
        initiativeId: i.id,
        txHash: dn.txHash,
        tokenSymbol: dn.tokenSymbol,
        amountUsdCents: dn.amountUsd === null || dn.amountUsd === undefined ? null : toCents(dn.amountUsd),
        status: dn.status,
        confirmedAt: tsToIso(dn.confirmedAt ?? null),
        explorerUrl: `https://etherscan.io/tx/${dn.txHash}`,
        provenance: prov("TheDAO API donation ledger (verified by the official indexer)", [apiUrl], retrievedAt),
      });
    }

    // People: official milestone reviewer field, and public profile links in the team section.
    const team = sections.find((s) => s.key === "team")?.markdown ?? "";
    for (const l of extractLinks(team)) {
      const profile = /^(https:\/\/(github\.com|x\.com|twitter\.com|www\.linkedin\.com\/in|linkedin\.com\/in)\/[A-Za-z0-9_.-]+)\/?$/.exec(l.url);
      if (!profile || !l.text) continue;
      const name = l.text.replace(/[*_`]/g, "").trim();
      if (!/^[A-Z][\p{L}'.-]+(\s+[A-Z][\p{L}'.-]+){0,3}$/u.test(name) && !/^@?[A-Za-z0-9_-]{2,39}$/.test(name)) continue;
      const pid = stableId("person", name.toLowerCase());
      const prev = people.get(pid);
      people.set(pid, {
        id: pid,
        name,
        role: null,
        initiativeIds: [...new Set([...(prev?.initiativeIds ?? []), i.id])],
        organizationId: null,
        publicProfiles: [...new Set([...(prev?.publicProfiles ?? []), l.url])],
        mentionedIn: [...new Set([...(prev?.mentionedIn ?? []), `${i.id}:team`])],
        provenance: prov("Linked public profile in the proposal's team section (applicant-provided)", [officialUrls.page(i.slug), l.url], retrievedAt, "applicant"),
      });
    }
    if (base.milestoneReviewer) {
      const pid = stableId("reviewer", base.milestoneReviewer.toLowerCase());
      const prev = people.get(pid);
      people.set(pid, {
        id: pid,
        name: base.milestoneReviewer,
        role: "Milestone reviewer (official field)",
        initiativeIds: [...new Set([...(prev?.initiativeIds ?? []), i.id])],
        organizationId: null,
        publicProfiles: [],
        mentionedIn: [...new Set([...(prev?.mentionedIn ?? []), `${i.id}:milestoneReviewer`])],
        provenance: prov("TheDAO API milestoneReviewer field", [apiUrl], retrievedAt),
      });
    }
  }

  // Organisations via identity resolution.
  const curated = (await readJson<CuratedAlias[]>(path.join(DATA_DIR, "curated", "aliases.json"))) ?? [];
  const { entities, candidates } = resolveIdentities(nameRecords, curated, (name) => `org_${slugify(name) || "unnamed"}`);
  const organizations: Organization[] = [];
  const aliases: OrganizationAlias[] = [];
  const orgByRecipientInitiative = new Map<string, string>();
  const orgByPledge = new Map<string, string>();
  for (const e of entities) {
    const recipientOf = [...new Set(e.records.filter((r) => r.role === "recipient").map((r) => r.initiativeId))];
    const backerOf = [...new Set(e.records.filter((r) => r.role === "backer").map((r) => r.initiativeId))];
    for (const r of e.records) (r.role === "recipient" ? orgByRecipientInitiative : orgByPledge).set(r.ref, e.id);
    const website = e.urls.find((u) => !/github\.com|x\.com|twitter\.com/.test(u)) ?? e.urls[0] ?? null;
    const gh = e.urls.map((u) => /^https?:\/\/github\.com\/([A-Za-z0-9-]+)/.exec(u)?.[1]).find(Boolean) ?? null;
    organizations.push({
      id: e.id,
      name: e.name,
      kind: recipientOf.length && backerOf.length ? "both" : recipientOf.length ? "recipient" : "backer",
      anonymous: e.anonymous,
      names: e.names,
      website,
      initiativeIds: recipientOf,
      backedInitiativeIds: backerOf,
      github: gh,
      description: null,
      websiteCheck: null,
      githubProfile: null,
      notes: [],
      provenance: prov("Identity resolution over official recipient and pledge records", e.urls, manifest.createdAt, "derived"),
    });
    // One alias row per distinct spelling that differs from the canonical name.
    for (const spelling of e.names) {
      if (spelling === e.name) continue;
      const res =
        e.resolutions.find((r) => r.name === spelling && r.resolution !== "exact_normalized") ??
        e.resolutions.find((r) => r.name === spelling) ??
        e.resolutions.find((r) => r.resolution === "curated_with_evidence");
      aliases.push({
        id: stableId("alias", e.id, spelling),
        alias: spelling,
        organizationId: e.id,
        resolution: res?.resolution ?? "exact_normalized",
        candidateOrganizationId: null,
        reason: res?.reason ?? "Same name after case/punctuation normalisation",
        sourceUrls: res?.sourceUrls ?? [],
      });
    }
    if (e.anonymous) {
      aliases.push({
        id: stableId("alias", e.id, "anon"),
        alias: e.name,
        organizationId: e.id,
        resolution: "anonymous_not_merged",
        candidateOrganizationId: null,
        reason: "Anonymous label. Pledges carrying the same label are kept as separate backers because nothing shows they are one entity.",
        sourceUrls: [],
      });
    }
  }
  for (const c of candidates) {
    aliases.push({
      id: stableId("alias-candidate", c.a, c.b),
      alias: entities.find((e) => e.id === c.b)?.name ?? c.b,
      organizationId: c.b,
      resolution: "candidate_unconfirmed",
      candidateOrganizationId: c.a,
      reason: c.reason,
      sourceUrls: [],
    });
  }
  for (const ini of initiatives) ini.organizationId = orgByRecipientInitiative.get(ini.id) ?? null;
  for (const p of pledges) p.backerId = orgByPledge.get(p.id) ?? "";
  for (const person of people.values()) {
    const ini = initiatives.find((x) => x.id === person.initiativeIds[0]);
    person.organizationId = ini?.organizationId ?? null;
  }

  // Revisions (immutable files written by ingestion).
  const revisions: Revision[] = [];
  for (const ini of initiatives) {
    const d = details.get(ini.id);
    for (const meta of d?.revisions ?? []) {
      const file = path.join(REVISIONS_DIR, ini.id, `${meta.n}.json`);
      const rev = await readJson<RevisionResponse>(file);
      const r = rev?.revision;
      revisions.push({
        id: stableId("rev", ini.id, String(meta.n)),
        initiativeId: ini.id,
        n: meta.n,
        createdAt: tsToIso(meta.createdAt) ?? manifest.createdAt,
        source: meta.source ?? null,
        state: meta.state ?? null,
        archived: meta.archived ?? false,
        title: r?.title ?? null,
        summary: r?.summary ?? null,
        sections: r?.sections ?? (r?.details ? { details: r.details } : null),
        milestones: r?.milestones
          ? r.milestones.map((m) => ({ name: m.name, amountCents: toCents(m.amount), adoption: m.adoption, done: m.done, criteria: m.criteria }))
          : null,
        goalCents: r?.goalUsd === null || r?.goalUsd === undefined ? null : toCents(r.goalUsd),
        fetched: !!r,
      });
    }
  }

  initiatives.sort((a, b) => a.title.localeCompare(b.title));
  return {
    manifest,
    ballot,
    initiatives,
    milestones,
    pledges,
    donations,
    organizations,
    aliases,
    people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)),
    revisions,
    details,
  };
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
