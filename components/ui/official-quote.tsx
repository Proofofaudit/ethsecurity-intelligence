import type { ReactNode } from "react";
import { OFFICIAL_QUOTE_ATTR, SOURCE_LABELS, type SourceKind } from "@/lib/neutralLanguage";
import { cn } from "@/lib/util/cn";

/**
 * One of the four source labels from NEUTRAL_LANGUAGE.md: Official data, Applicant statement,
 * Independent evidence or AI interpretation. Text only, so it never depends on color.
 */
export function SourceLabel({ kind, className }: { kind: SourceKind; className?: string }) {
  return (
    <span data-source-label={kind} className={cn("text-2xs font-medium tracking-wide whitespace-nowrap text-ink-3 uppercase", className)}>
      {SOURCE_LABELS[kind]}
    </span>
  );
}

/**
 * Verbatim text from an official TheDAO source, shown as a marked quotation with attribution.
 * Text inside this component is a quotation, not our voice; it is the only place where the
 * neutral-language lint allows a banned phrase (for example an official tier definition).
 */
export function OfficialQuote({ children, source, sourceName = "TheDAO Security Fund", paraphrase, className }: { children: ReactNode; source: string; sourceName?: string; paraphrase?: boolean; className?: string }) {
  return (
    <figure {...{ [OFFICIAL_QUOTE_ATTR]: "" }} className={cn("border-l-2 border-rule-2 pl-3", className)}>
      <figcaption className="mb-1 flex flex-wrap items-baseline gap-x-2 text-2xs text-ink-3">
        <SourceLabel kind="official" />
        <span>
          {paraphrase ? "Paraphrased from" : "Quoted from"}{" "}
          <a href={source} className="underline decoration-rule-2 underline-offset-2 hover:text-accent" rel="noreferrer">
            {sourceName}
          </a>
        </span>
      </figcaption>
      <blockquote className="text-sm text-ink-2">{children}</blockquote>
    </figure>
  );
}
