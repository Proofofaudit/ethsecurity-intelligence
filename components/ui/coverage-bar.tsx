import type { CoveragePart } from "@/lib/team/types";
import { cn } from "@/lib/util/cn";

const TONE: Record<CoveragePart["tone"], string> = {
  in_scope: "bg-st-verified",
  unmatched: "bg-st-partial",
  unchecked: "bg-ink-3",
};

const SWATCH: Record<CoveragePart["tone"], string> = {
  in_scope: "bg-st-verified",
  unmatched: "bg-st-partial",
  unchecked: "bg-ink-3",
};

function pct(count: number, total: number) {
  if (total <= 0) return "0%";
  return `${((count / total) * 100).toFixed(1)}%`;
}

/** Labelled count split from a source page. The bar repeats the words; colour is not the only cue. */
export function CoverageBar({ totalLabel, parts }: { totalLabel?: string; parts: CoveragePart[] }) {
  const total = parts.reduce((s, p) => s + p.count, 0);
  const alt = parts.map((p) => `${p.count.toLocaleString("en-US")} ${p.label} (${pct(p.count, total)})`).join(", ");
  return (
    <figure className="mt-2 max-w-[520px]" data-coverage-bar>
      {totalLabel && <figcaption className="num text-sm font-semibold text-ink">{totalLabel}</figcaption>}
      <div className="mt-1.5 flex h-3 overflow-hidden rounded-xs bg-paper-3" role="img" aria-label={alt}>
        {parts.map((p) => (
          <span key={p.label} className={cn("block h-full", TONE[p.tone])} style={{ width: total ? `${(p.count / total) * 100}%` : "0%" }} />
        ))}
      </div>
      <ul className="mt-2 space-y-1 text-xs text-ink-2">
        {parts.map((p) => (
          <li key={p.label} className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn("inline-block size-2.5 rounded-[1px]", SWATCH[p.tone])} />
              {p.label}
            </span>
            <span className="num text-ink">
              {p.count.toLocaleString("en-US")} <span className="text-ink-3">{pct(p.count, total)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-2xs text-ink-3">Counts stated on the source page. This bar is not a score.</p>
    </figure>
  );
}
