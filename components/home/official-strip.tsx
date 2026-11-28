import type { ReactNode } from "react";
import { ArrowUpRight } from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/overlay";
import { cn } from "@/lib/util/cn";

export interface OfficialMetric {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Plain-language answer to "what is this?". */
  help: string;
  headline?: boolean;
}

/**
 * The only place official TheDAO figures appear on the home page. The same figures are shown
 * live on TheDAO's own site, so this strip is labeled as a copy and links to the official page.
 */
export function OfficialStrip({ metrics, officialUrl, officialHost, children }: { metrics: OfficialMetric[]; officialUrl: string; officialHost: string; children?: ReactNode }) {
  return (
    <section aria-labelledby="official-h" data-testid="official-strip">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="official-h" className="text-md font-semibold">
          Official figures (from TheDAO)
        </h2>
        <a href={officialUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-ink-3 hover:text-accent">
          Official page, {officialHost} <ArrowUpRight />
        </a>
      </div>
      <dl className="grid grid-cols-2 gap-px border-y border-ink bg-rule sm:grid-cols-4 [&>div]:bg-paper [&>div]:px-4 [&>div]:py-4">
        {metrics.map((m) => (
          <div key={m.label} className={cn("min-w-0", m.headline && "sm:col-span-1")} data-headline={m.headline ? "" : undefined}>
            <dt className="flex items-baseline justify-between gap-2 text-xs text-ink-3">
              <span>{m.label}</span>
              <Tooltip content={m.help}>
                <button type="button" className="shrink-0 text-2xs text-ink-3 underline decoration-dotted hover:text-accent" aria-label={`What is this? ${m.label}`}>
                  what is this?
                </button>
              </Tooltip>
            </dt>
            <dd className={cn("mt-1 font-medium tracking-[-0.01em]", m.headline ? "text-[28px] leading-8 max-sm:text-[23px]" : "text-[22px] leading-7 max-sm:text-[19px]")}>{m.value}</dd>
            {m.sub && <dd className="mt-1 text-xs text-ink-3">{m.sub}</dd>}
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}
