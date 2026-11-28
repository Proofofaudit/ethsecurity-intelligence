import Link from "next/link";
import { ExternalLink } from "@/components/ui/button";
import { Note } from "@/components/ui/layout";
import { formatDate } from "@/components/ui/money";
import { SourceLabel } from "@/components/ui/official-quote";
import { StatusMark } from "@/components/ui/status";
import type { CardItem, EvidenceCard as Card } from "@/lib/intelligence/service";
import { cn } from "@/lib/util/cn";

function Fact({ item }: { item: CardItem }) {
  return (
    <div className="contents" data-testid="evidence-fact" data-source-kind={item.sourceKind} data-flag={item.flag?.kind ?? undefined}>
      <dt className="border-b border-rule py-1.5 pr-3 text-ink-3 max-sm:border-0 max-sm:pb-0">{item.label}</dt>
      <dd className="min-w-0 border-b border-rule py-1.5 max-sm:pt-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 [overflow-wrap:anywhere]">
          {item.value &&
            (item.link ? (
              item.link.startsWith("#") ? (
                <a href={item.link} className="link min-w-0 [overflow-wrap:anywhere]">
                  {item.value}
                </a>
              ) : (
                <ExternalLink href={item.link} className="min-w-0 [overflow-wrap:anywhere]">
                  {item.value}
                </ExternalLink>
              )
            ) : (
              <span className="min-w-0 text-ink">{item.value}</span>
            ))}
          {item.status && <StatusMark status={item.status} />}
        </div>
        {item.details.length > 0 && <p className="mt-0.5 text-xs text-ink-2">{item.details.join(" · ")}</p>}
        {item.flag && (
          <p className={cn("mt-0.5 text-xs font-medium", item.flag.kind === "self_pledge" ? "text-ink-2" : "text-st-partial")} data-testid="evidence-flag">
            {item.flag.text}
          </p>
        )}
        {item.note && <p className="mt-0.5 text-xs text-ink-3">{item.note}</p>}
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-2xs text-ink-3">
          <SourceLabel kind={item.sourceKind} />
          <a href={item.sourceUrl} className="underline decoration-rule-2 underline-offset-2 hover:text-accent" rel="noreferrer" data-testid="evidence-source">
            {item.sourceName}
          </a>
          <span data-testid="evidence-checked">
            checked on{" "}
            <time dateTime={item.checkedAt} className="num">
              {formatDate(item.checkedAt)}
            </time>
          </span>
        </p>
      </dd>
    </div>
  );
}

/**
 * Evidence card at the top of every dossier. The same six sections in the same order for every
 * initiative; facts, links and dates only, each with one of the four source labels.
 */
export function EvidenceCard({ card }: { card: Card }) {
  return (
    <section aria-labelledby="evidence-card-title" data-testid="evidence-card" className="mt-10 scroll-mt-20 border-t border-ink pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="evidence-card-title" className="text-md font-semibold">
          Evidence card
        </h2>
        <p className="text-xs text-ink-3">
          Checks from <time dateTime={card.oldestCheck}>{formatDate(card.oldestCheck)}</time> to <time dateTime={card.newestCheck}>{formatDate(card.newestCheck)}</time> · dataset published{" "}
          <time dateTime={card.publishedAt}>{formatDate(card.publishedAt)}</time>
        </p>
      </div>
      <div className="mt-3 grid gap-x-10 gap-y-6 lg:grid-cols-2">
        {card.sections.map((s) => (
          <div key={s.key} data-testid="evidence-section" data-section={s.key} className="min-w-0">
            <h3 className="eyebrow mb-1.5">{s.title}</h3>
            {s.items.length === 0 ? (
              <p className="border-t border-rule py-1.5 text-sm text-ink-3" data-testid="evidence-empty">
                {s.emptyText}
              </p>
            ) : (
              <dl className="grid grid-cols-[minmax(0,150px)_1fr] border-t border-rule text-sm max-sm:grid-cols-1">
                {s.items.map((i) => (
                  <Fact key={i.key} item={i} />
                ))}
              </dl>
            )}
          </div>
        ))}
      </div>
      <Note className="mt-4">
        {card.cacheNote} {card.activityNote} A link listed here is not an endorsement, and a flag is a prompt to check, not a finding. See{" "}
        <Link href="/about#evidence-card" className="link">
          Methodology
        </Link>{" "}
        for the rules. Raw data:{" "}
        <a href={`/api/v1/initiatives/${encodeURIComponent(card.slug)}/evidence-card`} className="link">
          API (JSON)
        </a>
        .
      </Note>
    </section>
  );
}
