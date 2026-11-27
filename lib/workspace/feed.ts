/**
 * Server-side builders for the review-progress feed and the export context. Everything is read
 * from the published dataset (d.changes, d.revisions, initiative.commentCount, the evidence card
 * and the Item 11 open questions). No request to TheDAO is made per user.
 */
import type { Dataset } from "@/lib/domain/schemas";
import { displayName, evidenceCard, openQuestionsFor } from "@/lib/intelligence/service";
import type { ExportContext } from "./export";
import type { VisitFeedEntry } from "./progress";

/** One entry per initiative: latest revision, comment count and the change records already published. */
export function visitFeed(d: Dataset): VisitFeedEntry[] {
  const latest = new Map<string, number>();
  for (const r of d.revisions) if (r.fetched) latest.set(r.initiativeId, Math.max(latest.get(r.initiativeId) ?? 0, r.n));
  const changes = new Map<string, VisitFeedEntry["changes"]>();
  for (const c of d.changes) if (c.initiativeId) changes.set(c.initiativeId, [...(changes.get(c.initiativeId) ?? []), { id: c.id, at: c.detectedAt, kind: c.kind, summary: c.summary }]);
  return [...d.initiatives]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((i) => ({ id: i.id, revision: latest.get(i.id) ?? null, commentCount: i.commentCount ?? null, changes: changes.get(i.id) ?? [] }));
}

const OFFICIAL_BASE = "https://initiatives.thedao.fund";

/** Everything the browser needs to write an export without another request. */
export function exportContext(d: Dataset): ExportContext {
  const initiatives = [...d.initiatives]
    .map((i) => ({ id: i.id, slug: i.slug, label: displayName(d, i), url: i.url }))
    .sort((a, b) => a.label.localeCompare(b.label, "en") || (a.id < b.id ? -1 : 1));
  const openQuestions: ExportContext["openQuestions"] = [];
  const evidenceLinks: ExportContext["evidenceLinks"] = [];
  for (const i of d.initiatives) {
    for (const q of openQuestionsFor(d, i.id) ?? []) openQuestions.push({ id: q.id, initiativeId: i.id, category: q.category, text: q.question, sourceUrl: q.sourceUrl });
    const card = evidenceCard(d, i.id);
    if (!card) continue;
    const seen = new Set<string>();
    for (const s of card.sections)
      for (const item of s.items) {
        if (!item.link || seen.has(item.link)) continue;
        seen.add(item.link);
        evidenceLinks.push({ initiativeId: i.id, section: s.title, label: item.label, url: item.link, sourceName: item.sourceName, checkedAt: item.checkedAt });
      }
  }
  const sourceUrls = [`${OFFICIAL_BASE}/api/initiatives.json?status=ballot`, `${OFFICIAL_BASE}/api/initiatives/<slug>`, `${OFFICIAL_BASE}/api/initiatives/<slug>/revisions/<n>`, `${OFFICIAL_BASE}/api/initiatives/<slug>/comments`, d.meta.officialSourceUrl].filter((u, k, a) => a.indexOf(u) === k);
  return { datasetVersion: d.meta.datasetVersion, dataAsOf: d.meta.generatedAt, initiatives, sourceUrls, openQuestions, evidenceLinks };
}
