import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/overlay";
import { cn } from "@/lib/util/cn";

/**
 * Frames a chart with a title, a "what is this?" tooltip and a visible text alternative, so no
 * chart relies on shape or color alone. The chart itself still carries an aria-label.
 */
export function ChartFrame({ title, help, alt, children, className }: { title: string; help: string; alt: ReactNode; children: ReactNode; className?: string }) {
  return (
    <figure className={cn("min-w-0", className)} data-chart={title}>
      <figcaption className="mb-1 flex items-baseline justify-between gap-2 text-xs text-ink-3">
        <span>{title}</span>
        <Tooltip content={help}>
          <button type="button" className="shrink-0 text-2xs text-ink-3 underline decoration-dotted hover:text-accent" aria-label={`What is this? ${title}`}>
            what is this?
          </button>
        </Tooltip>
      </figcaption>
      {children}
      <p className="mt-1 text-2xs text-ink-3" data-chart-alt>
        {alt}
      </p>
    </figure>
  );
}
