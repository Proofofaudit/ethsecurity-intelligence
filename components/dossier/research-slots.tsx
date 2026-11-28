import type { ReactNode } from "react";
import { AiInterpretation, NotYetResearched } from "@/components/ui/ai-interpretation";
import { BLIND_SPOT_LABEL, blindSpotSources, type BlindSpot, type ResearchCoverage } from "@/lib/intelligence/service";
import type { Claim, Dataset } from "@/lib/domain/schemas";

/**
 * Dossier slots for AI research (Item 14). The site runs no AI model. Deterministic text is never
 * labelled AI. Published claims with origin "ai" go through AiInterpretation, so they get the
 * label, the citation requirement and the neutral-language filter.
 */
export function AiSlot({ what, coverage, aiClaims }: { what: string; coverage: ResearchCoverage; aiClaims: readonly Claim[] }) {
  if (coverage.aiResearched) {
    return (
      <div className="mb-3 space-y-2" data-ai-slot={what} data-ai-published>
        <p className="eyebrow mb-1">AI research</p>
        {aiClaims.map((c) => (
          <AiInterpretation key={c.id} text={c.assertion} citations={c.sourceUrls.map((u) => ({ url: u, label: u.replace(/^https?:\/\/(www\.)?/, "") }))} provenance={null} />
        ))}
      </div>
    );
  }
  return (
    <div className="mb-3" data-ai-slot={what}>
      <p className="eyebrow mb-1">AI research</p>
      <AiInterpretation text={null} citations={[]} provenance={null} missing={[`No AI research result is published for this initiative. The ${what} below come from fixed rules over the evidence record.`]} />
    </div>
  );
}

/** Supporting statements. `list` is the claim list for non-AI claims. */
export function SupportingBody({ coverage, list }: { coverage: ResearchCoverage; list: ReactNode }) {
  if (!coverage.researched) return <NotYetResearched missing={coverage.missing} />;
  return (
    <>
      {coverage.missing.length > 0 && (
        <NotYetResearched missing={coverage.missing}>Only some research checks have run. Statements may gain supporting evidence when the rest have run.</NotYetResearched>
      )}
      {list}
    </>
  );
}

export function CounterBody({ d, higher, coverage }: { d: Dataset; higher: readonly BlindSpot[]; coverage: ResearchCoverage }) {
  return (
    <>
      {!coverage.researched && (
        <NotYetResearched missing={coverage.missing}>
          The questions below come from the proposal text and the milestone record. Questions that depend on research results, such as whether linked repositories exist, are not raised until the research has run.
        </NotYetResearched>
      )}
      {higher.length ? (
        <ul className="divide-y divide-rule border-y border-rule">
          {higher.map((b) => (
            <li key={b.id} className="py-2.5 text-sm" data-counterargument>
              <span className="text-2xs text-ink-3 uppercase">{BLIND_SPOT_LABEL[b.category]}</span>
              <p className="text-ink">{b.question}</p>
              <p className="mt-0.5 text-xs text-ink-3">Basis: {b.basis}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-3" data-counter-sources>
                <span>Source:</span>
                {blindSpotSources(d, b).map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="underline decoration-rule-2 underline-offset-2 hover:text-accent">
                    {s.label}
                  </a>
                ))}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">No higher-importance gaps were raised by the rules.</p>
      )}
    </>
  );
}
