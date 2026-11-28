import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { SourceLabel } from "@/components/ui/official-quote";
import { BRIEFING_MINUTES, BRIEFING_NOTE, LINK_TYPE_LABEL, OPTIONAL_RULE, READING_TIME_RULE, type Briefing, type BriefingBody, type BriefingItem } from "@/lib/intelligence/briefing";
import { cn } from "@/lib/util/cn";
import { ReadMark, ReadProgress } from "./briefing-read";

function Body({ body }: { body: BriefingBody }) {
  if (body.type === "markdown") return <Markdown source={body.markdown} />;
  if (body.type === "links")
    return (
      <ul className="divide-y divide-rule border-y border-rule text-sm" data-briefing-links>
        {body.links.map((l) => (
          <li key={l.url} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
            <span className="w-16 shrink-0 text-2xs font-medium tracking-wide text-ink-3 uppercase" data-link-type={l.type}>
              {LINK_TYPE_LABEL[l.type]}
            </span>
            <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="link break-all">
              {l.title}
            </a>
            <span className="text-xs text-ink-3">{l.where}</span>
          </li>
        ))}
      </ul>
    );
  return (
    <ul className="space-y-1 text-sm text-ink-2">
      {body.lines.map((l, i) => {
        const text = l.href ? (
          <a href={l.href} target="_blank" rel="noopener noreferrer nofollow" className="link break-words">
            {l.text}
          </a>
        ) : (
          l.text
        );
        if (l.style === "heading")
          return (
            <li key={i} className="mt-2 list-none font-semibold text-ink first:mt-0">
              {text}
            </li>
          );
        return (
          <li key={i} className="ml-4 list-[square] marker:text-ink-3">
            {text}
            {l.sourceLabel && <span className="ml-2 text-2xs text-ink-3">{l.sourceLabel}</span>}
          </li>
        );
      })}
    </ul>
  );
}

const KIND_LABEL: Record<BriefingItem["kind"], "applicant" | "official" | "independent"> = { summary: "applicant", section: "applicant", milestones: "applicant", links: "applicant", round1: "independent", evidence_card: "official" };

function Item({ item, n, open }: { item: BriefingItem; n: number; open?: boolean }) {
  return (
    <li className={cn("py-3", item.optional && "opacity-95")} data-briefing-item={item.key} data-optional={item.optional ? "true" : "false"} data-minutes={item.minutes}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="num w-5 text-xs text-ink-3">{n}</span>
        <h4 className="min-w-0 flex-1 text-base font-semibold">{item.title}</h4>
        {item.optional && (
          <span className="text-2xs font-medium tracking-wide text-ink-3 uppercase" data-briefing-optional>
            Optional
          </span>
        )}
        <span className="num text-sm" data-briefing-minutes>
          {item.minutes} min
        </span>
        <ReadMark id={item.id} title={item.title} />
      </div>
      <div className="mt-1 pl-8">
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-3">
          {item.kind !== "evidence_card" && <SourceLabel kind={KIND_LABEL[item.kind]} />}
          <span className="num">{item.words} words</span>
          {item.sources.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="link" data-briefing-source>
              {s.label}
            </a>
          ))}
        </p>
        <details open={open} className="mt-1.5">
          <summary className="cursor-pointer text-xs text-ink-2 hover:text-accent">Read the quoted text</summary>
          <div className="mt-2 max-w-[820px] border-l-2 border-rule-2 pl-4">
            <Body body={item.body} />
          </div>
        </details>
      </div>
    </li>
  );
}

/**
 * 10-minute briefing (Item 12). The same component renders every dossier: an ordered list of
 * quoted official text with reading times, source links and a local "Mark as read" box. The
 * order is fixed: summary, proposal sections, milestones, links, Round 1, Evidence card.
 */
export function BriefingView({ briefing, chainHref, heading = "h2", children }: { briefing: Briefing; chainHref?: string; heading?: "h2" | "h3"; children?: ReactNode }) {
  const H = heading;
  const optionalFrom = briefing.items.find((i) => i.optional);
  return (
    <section aria-labelledby={`briefing-${briefing.slug}`} data-testid="briefing" data-briefing-total={briefing.totalMinutes} className="mt-10 border-t border-ink pt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <H id={`briefing-${briefing.slug}`} className="text-md font-semibold">
          10-minute briefing
        </H>
        <p className="num text-sm" data-briefing-total-label>
          Total {briefing.totalMinutes} min · {briefing.totalWords.toLocaleString("en-US")} words
        </p>
      </div>
      <p className="max-w-[820px] text-xs text-ink-3">{BRIEFING_NOTE}</p>
      <p className="mt-1 max-w-[820px] text-xs text-ink-3">
        {READING_TIME_RULE} {OPTIONAL_RULE}{optionalFrom ? "" : ` In this briefing every item starts before minute ${BRIEFING_MINUTES}, so none is marked Optional.`}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <ReadProgress items={briefing.items.map((i) => ({ id: i.id, minutes: i.minutes }))} />
        {chainHref && (
          <Link href={chainHref} className="link text-xs" data-briefing-chain-link>
            Briefing for all in my focus
          </Link>
        )}
      </div>
      <ol className="mt-2 divide-y divide-rule border-y border-rule">
        {briefing.items.map((it, i) => (
          <Item key={it.id} item={it} n={i + 1} open={it.key === "summary"} />
        ))}
      </ol>
      {briefing.otherSections.length > 0 && (
        <p className="mt-2 max-w-[820px] text-xs text-ink-3" data-briefing-other>
          Other official sections not in this order:{" "}
          {briefing.otherSections.map((s, i) => (
            <span key={s.key}>
              {i > 0 && ", "}
              <ExternalLink href={s.url}>{s.heading}</ExternalLink>
            </span>
          ))}
          .
        </p>
      )}
      {children}
    </section>
  );
}
