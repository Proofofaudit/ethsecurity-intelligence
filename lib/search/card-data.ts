/**
 * Public, serializable data for one initiative card and for the name-search index.
 * Built on the server from the published dataset and the team research file; contains no
 * personal data and no emails.
 */
import type { Dataset } from "@/lib/domain/schemas";
import { sharedAffiliations, type SharedGroup } from "@/lib/vote/affiliation";
import type { TeamResearchFile } from "@/lib/team/types";
import { CLAIM_TO_BADGE, DELIVERY_TO_BADGE, type BadgeCount, type DeliveryBadgeKind, type EvidenceBadgeKind } from "./badge-kinds";
import { displayName } from "@/lib/intelligence/service";
import { logoFor, type Logo } from "@/lib/team/logos";

export interface CardData {
  id: string;
  slug: string;
  title: string;
  shortTitle: string;
  /** Title shown on the card: the short title, or the full title when two initiatives share a short title. */
  displayTitle: string;
  organization: string | null;
  /** Official initiative page on TheDAO. Funding figures are not copied onto the card. */
  officialUrl: string;
  /** null when no team research is published for the initiative. */
  evidence: BadgeCount<EvidenceBadgeKind>[] | null;
  delivery: BadgeCount<DeliveryBadgeKind>[] | null;
  affiliatedWith: SharedGroup[];
  logo: Logo | null;
}

const EVIDENCE_ORDER: EvidenceBadgeKind[] = ["verified", "not_verified", "contradicted", "not_found"];
const DELIVERY_ORDER: DeliveryBadgeKind[] = ["delivered", "partial", "none"];

function count<K extends string>(order: K[], kinds: K[]): BadgeCount<K>[] {
  return order.map((kind) => ({ kind, count: kinds.filter((k) => k === kind).length })).filter((c) => c.count > 0);
}

/** Badge counts for one initiative from team research; null badges mean "Not yet researched". */
export function badgesFor(team: TeamResearchFile | null, initiativeId: string): Pick<CardData, "evidence" | "delivery"> {
  const t = team?.initiatives.find((i) => i.initiativeId === initiativeId);
  if (!t) return { evidence: null, delivery: null };
  const ev = count(EVIDENCE_ORDER, t.claimChecks.map((c) => CLAIM_TO_BADGE[c.status]));
  return {
    evidence: ev,
    delivery: count(DELIVERY_ORDER, t.deliveryTimeline.map((e) => DELIVERY_TO_BADGE[e.status])),
  };
}

export function buildCardData(d: Dataset, team: TeamResearchFile | null, logos?: Readonly<Record<string, Logo>>): CardData[] {
  const orgById = new Map(d.organizations.map((o) => [o.id, o.name]));
  const shared = sharedAffiliations(d);
  return d.initiatives
    .map((i): CardData => ({
        id: i.id,
        slug: i.slug,
        title: i.title,
        shortTitle: i.shortTitle,
        displayTitle: displayName(d, i),
        organization: (i.organizationId ? orgById.get(i.organizationId) : null) ?? i.recipientTeam,
        officialUrl: i.url,
        ...badgesFor(team, i.id),
        affiliatedWith: shared[i.id] ?? [],
        logo: logoFor(i.id, logos),
    }))
    .sort((a, b) => a.displayTitle.localeCompare(b.displayTitle) || a.id.localeCompare(b.id));
}
