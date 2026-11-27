import Link from "next/link";
import { Note } from "@/components/ui/layout";
import { OfficialQuote } from "@/components/ui/official-quote";
import { NEUTRAL_SORT_LABEL } from "@/lib/neutralLanguage";
import type { SimilarItem } from "@/lib/intelligence/service";

/**
 * Similar initiatives (Item 10). The same component renders every dossier. Each pair shows its
 * label, the signals, one sentence from each proposal per text signal, the hypothesis notice and
 * a link that opens the comparison with both initiatives selected. Engine output only.
 */
export function SimilarInitiatives({ items, self }: { items: SimilarItem[]; self: { name: string } }) {
  return (
    <div data-testid="similar-initiatives" className="max-w-[880px] space-y-4">
      <Note>
        Pairs found by fixed rules: shared official categories, a shared affiliation group in TheDAO&apos;s vote manifest, shared phrases in the problem and scope sections, named standards and technologies, and shared public backers. A pair with only one weak signal is not shown. {NEUTRAL_SORT_LABEL}, by title. No score is computed.{" "}
        <Link href="/methodology#similar" className="link">
          Method
        </Link>
      </Note>
      {items.length === 0 ? (
        <p data-testid="similar-empty" className="text-sm text-ink-3">
          No similar initiative was found by these rules.
        </p>
      ) : (
        <ol className="space-y-6">
          {items.map((it) => (
            <li key={it.other.id} data-testid="similar-pair" data-label={it.label} className="border-t border-ink pt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-sm font-semibold">
                  <Link href={`/initiatives/${it.other.slug}`} className="hover:text-accent">
                    {it.other.title}
                  </Link>
                  {it.other.type === "rfp" && <span className="ml-2 text-2xs font-normal tracking-wide text-ink-3 uppercase">RFP</span>}
                </h3>
                <p data-testid="similar-label" className="text-2xs tracking-wide text-ink-3 uppercase">
                  {it.label}
                </p>
              </div>
              <p data-testid="similar-notice" className="mt-1 text-xs text-ink-3">
                {it.notice}.
              </p>
              <ul className="mt-2 space-y-3 text-sm">
                {it.signals.map((s) => (
                  <li key={s.kind} data-signal={s.kind}>
                    <p className="text-ink-2">{s.label}</p>
                    {s.quotes && (
                      <div className="mt-1.5 grid gap-3 md:grid-cols-2">
                        {s.quotes.map((q, n) => (
                          <OfficialQuote key={q.initiativeId} kind="applicant" source={q.url} sourceName={`${n === 0 ? self.name : it.other.name}, ${q.heading}`} className="[overflow-wrap:anywhere]">
                            {q.text}
                          </OfficialQuote>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs">
                <Link href={it.compareHref} data-testid="compare-these" className="link">
                  Compare these
                </Link>
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
