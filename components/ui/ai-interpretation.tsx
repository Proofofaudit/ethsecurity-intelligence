import type { ReactNode } from "react";
import { NOT_VERIFIED_NOTE, NOT_YET_RESEARCHED, prepareAiInterpretation, VERIFICATION_LABEL, type AiCitation, type AiInput } from "@/lib/ai/interpretation";
import { cn } from "@/lib/util/cn";
import { SourceLabel } from "./official-quote";

function CitationList({ items, title }: { items: readonly AiCitation[]; title: string }) {
  return (
    <div className="mt-1.5">
      <p className="text-2xs text-ink-3">{title}</p>
      <ol className="mt-0.5 list-decimal space-y-0.5 pl-5 text-xs" data-ai-citations>
        {items.map((c) => (
          <li key={c.url}>
            <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-ink-2 underline decoration-rule-2 underline-offset-2 hover:text-accent" data-ai-citation>
              {c.label}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The explicit empty state for missing research. Lists what is missing; never shows generated prose. */
export function NotYetResearched({ missing, className, children }: { missing?: readonly string[]; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("border-l-2 border-rule-2 pl-3 text-sm", className)} data-not-yet-researched>
      <p className="font-medium text-ink-2">{NOT_YET_RESEARCHED}</p>
      {children && <div className="mt-0.5 text-xs text-ink-3">{children}</div>}
      {missing && missing.length > 0 && (
        <ul className="mt-0.5 list-disc pl-5 text-xs text-ink-3">
          {missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One AI-generated statement. Applies the display rules in lib/ai/interpretation.ts: the
 * neutral-language filter runs first, text without a citation is not shown, and the label
 * "AI interpretation" with citations and provenance is always attached. Text is rendered as
 * plain text only.
 */
export function AiInterpretation({ className, ...input }: AiInput & { className?: string }) {
  const v = prepareAiInterpretation(input);
  if (v.state === "not_researched") return <NotYetResearched missing={v.missing} className={className} />;
  if (v.state === "evidence_only")
    return (
      <div className={cn("border-l-2 border-rule-2 pl-3 text-sm", className)} data-ai-state="evidence_only">
        <p className="text-xs text-ink-3">{v.notice}</p>
        <CitationList items={v.evidence} title="Underlying evidence" />
      </div>
    );
  const prov = v.provenance;
  return (
    <figure className={cn("border-l-2 border-rule-2 pl-3", className)} data-ai-state={v.state}>
      <figcaption className="mb-1 flex flex-wrap items-baseline gap-x-2 text-2xs text-ink-3">
        <SourceLabel kind="ai" />
        {prov ? (
          <span data-ai-provenance>
            Model {prov.model || "not stated"} · prompt {prov.promptVersion || "not stated"} · <span className="num">{prov.sourcesExamined}</span> {prov.sourcesExamined === 1 ? "source" : "sources"} examined · {VERIFICATION_LABEL[prov.verificationStatus]}
          </span>
        ) : (
          <span data-ai-provenance>Provenance not stated · {VERIFICATION_LABEL.not_verified}</span>
        )}
      </figcaption>
      {v.state === "shown" ? (
        <>
          <p className="text-sm text-ink-2 whitespace-pre-line" data-ai-text>
            {v.text}
          </p>
          <CitationList items={v.citations} title="Cited sources" />
        </>
      ) : (
        <>
          <p className="text-xs font-medium text-st-contradicted" data-ai-filtered>
            {v.notice}
          </p>
          {v.evidence.length > 0 && <CitationList items={v.evidence} title="Raw evidence" />}
        </>
      )}
      <p className="mt-1 text-2xs text-ink-3">{NOT_VERIFIED_NOTE}</p>
    </figure>
  );
}
