import Link from "next/link";
import type { ReactNode } from "react";
import { BadgeRow } from "@/components/ui/badges";
import { TheDaoStatus } from "@/components/ui/thedao-status";
import { SharedGroupLine } from "@/components/workspace/affiliations";
import { ExternalLink } from "@/components/ui/button";
import { letterMark } from "@/lib/team/logos";
import type { CardData } from "@/lib/search/card-data";
import type { EvidenceLink } from "@/lib/search/connections";
import { cn } from "@/lib/util/cn";

/** Public logo (a local copy from the organization's own site or GitHub avatar) or a letter mark. */
export function Logo({ card, className }: { card: Pick<CardData, "logo" | "organization" | "displayTitle">; className?: string }) {
  const label = card.organization ?? card.displayTitle;
  if (card.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={card.logo.src} alt={card.logo.alt} width={36} height={36} className={cn("size-9 shrink-0 rounded-xs border border-rule object-contain", className)} />;
  }
  return (
    <span aria-hidden="true" className={cn("flex size-9 shrink-0 items-center justify-center rounded-xs border border-rule-2 bg-paper-2 text-md font-semibold text-ink-2", className)} data-letter-mark>
      {letterMark(label)}
    </span>
  );
}

/**
 * One initiative card: logo or letter mark, short title, organization, optional why-line,
 * evidence badge row, a link to live funding on TheDAO, affiliation flag and dossier link. No summary paragraph.
 */
export function InitiativeCard({ card, why, evidence, actions, className, headingLevel = 3 }: { card: CardData; why?: string; evidence?: EvidenceLink[]; actions?: ReactNode; className?: string; headingLevel?: 3 | 4 }) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  return (
    <article className={cn("flex h-full min-w-0 flex-col gap-2 border border-rule p-3", className)} data-initiative-card={card.slug} aria-label={card.displayTitle}>
      <div className="flex items-start gap-3">
        <Logo card={card} />
        <div className="min-w-0 flex-1">
          <Heading className="text-sm leading-5 font-semibold">
            <Link href={`/initiatives/${card.slug}`} className="hover:text-accent" title={card.title}>
              {card.displayTitle}
            </Link>
          </Heading>
          <p className="truncate text-xs text-ink-3">{card.organization ?? "Request for proposals, no designated recipient"}</p>
        </div>
        {actions}
      </div>
      {why && (
        <p className="text-xs text-ink-2" data-why>
          {why}
        </p>
      )}
      {evidence && evidence.length > 0 && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs" data-evidence-links>
          {evidence.map((e) => (
            <ExternalLink key={e.url} href={e.url}>
              {e.label}
            </ExternalLink>
          ))}
        </p>
      )}
      <BadgeRow evidence={card.evidence} delivery={card.delivery} />
      <TheDaoStatus href={card.officialUrl} className="mt-auto text-xs text-ink-2" />
      <SharedGroupLine groups={card.affiliatedWith} />
      <p className="text-xs">
        <Link href={`/initiatives/${card.slug}`} className="link">
          Open dossier
        </Link>
      </p>
    </article>
  );
}
