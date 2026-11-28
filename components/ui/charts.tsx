import Link from "next/link";
import { formatUsd } from "@/lib/util/money";
import { cn } from "@/lib/util/cn";

/**
 * Hand-built charts. Every chart draws real dataset values only and carries a text alternative.
 */

export interface FundingParts {
  goalCents: number;
  /** Outstanding pledges (not yet received). */
  pledgedCents: number;
  /** Confirmed onchain donations, including pledges marked received. */
  donatedCents: number;
  /** Optional precomputed gap (for example the cohort Σ max(0, goal − raised)). */
  neededCents?: number;
}

export function fundingSplit(f: FundingParts) {
  const raised = f.pledgedCents + f.donatedCents;
  const needed = f.neededCents ?? Math.max(0, f.goalCents - raised);
  const scale = Math.max(f.goalCents, raised) || 1;
  return { raised, needed, scale, over: raised > f.goalCents };
}

/** One funding bar per initiative: received, pledged, still needed. */
export function FundingBar({ f, className, height = 8, legend = false }: { f: FundingParts; className?: string; height?: number; legend?: boolean }) {
  const { needed, scale, over } = fundingSplit(f);
  const w = (c: number) => `${(c / scale) * 100}%`;
  const alt = `Received ${formatUsd(f.donatedCents)}, pledged ${formatUsd(f.pledgedCents)}, still needed ${formatUsd(needed)} of a ${formatUsd(f.goalCents)} goal${over ? " (raised exceeds the goal)" : ""}.`;
  return (
    <div className={className}>
      <div className="flex w-full overflow-hidden rounded-xs bg-bar-needed" style={{ height }} role="img" aria-label={alt}>
        <span className="block h-full bg-bar-received" style={{ width: w(f.donatedCents) }} />
        <span className="block h-full bg-bar-pledged" style={{ width: w(f.pledgedCents) }} />
      </div>
      {legend && <FundingLegend f={f} className="mt-2" />}
    </div>
  );
}

export function FundingLegend({ f, className }: { f: FundingParts; className?: string }) {
  const { needed } = fundingSplit(f);
  const item = (sw: string, label: string, cents: number) => (
    <li className="flex items-center gap-1.5">
      <span className={cn("inline-block size-2.5 rounded-[1px]", sw)} aria-hidden="true" />
      <span className="text-ink-3">{label}</span>
      <span className="num text-ink">{formatUsd(cents)}</span>
    </li>
  );
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs", className)}>
      {item("bg-bar-received", "Received", f.donatedCents)}
      {item("bg-bar-pledged", "Pledged", f.pledgedCents)}
      {item("bg-bar-needed ring-1 ring-inset ring-rule-2", "Still needed", needed)}
    </ul>
  );
}

export interface HBarRow {
  key: string;
  label: string;
  value: number;
  /** Optional second value drawn inside the first (e.g. raised within requested). */
  inner?: number;
  valueLabel: string;
  sub?: string;
  href?: string;
}

/** Horizontal bars with labels on the left and figures on the right. */
export function HBarList({ rows, max, caption, className }: { rows: HBarRow[]; max?: number; caption: string; className?: string }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure className={className}>
      <ul className="divide-y divide-rule">
        {rows.map((r) => {
          const label = (
            <span className="truncate" title={r.label}>
              {r.label}
            </span>
          );
          return (
            <li key={r.key} className="grid grid-cols-[minmax(0,11rem)_1fr_10rem] items-center gap-3 py-1.5 text-sm max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-y-1">
              {r.href ? (
                <Link href={r.href} className="truncate hover:text-accent">
                  {label}
                </Link>
              ) : (
                label
              )}
              <span className="relative block h-2 rounded-xs bg-bar-needed max-sm:col-span-2 max-sm:row-start-2" aria-hidden="true">
                <span className="absolute inset-y-0 left-0 rounded-xs bg-bar-pledged" style={{ width: `${(r.value / m) * 100}%` }} />
                {r.inner !== undefined && <span className="absolute inset-y-0 left-0 rounded-xs bg-bar-received" style={{ width: `${(r.inner / m) * 100}%` }} />}
              </span>
              <span className="num text-right text-xs text-ink-2 max-sm:col-start-2 max-sm:row-start-1">
                {r.valueLabel}
                {r.sub && <span className="ml-2 text-ink-3">{r.sub}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

/** Small proportion bar for a single ratio (0..1). */
export function RatioBar({ value, className, label }: { value: number | null; className?: string; label: string }) {
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <span className={cn("relative inline-block h-1.5 w-16 rounded-xs bg-bar-needed align-middle", className)} role="img" aria-label={label}>
      <span className="absolute inset-y-0 left-0 rounded-xs bg-ink-2" style={{ width: `${v * 100}%` }} />
    </span>
  );
}

export const MONTHS_IN_SPARKLINE = 12;

/** Text alternative for a 12-month commit sparkline. */
export function sparklineAlt(values: readonly number[]): string {
  if (values.length === 0) return "Not found in public sources.";
  const total = values.reduce((s, v) => s + v, 0);
  return `Public commits per month over the last ${values.length} months, oldest first: ${values.join(", ")}. Total ${total}.`;
}

/** 12-month public commit sparkline. Draws real counts only; an empty series shows "Not found in public sources". */
export function Sparkline({ values, className }: { values: readonly number[]; className?: string }) {
  if (values.length === 0) return <p className={cn("text-xs text-ink-3", className)}>Not found in public sources</p>;
  const max = Math.max(1, ...values);
  const w = 6;
  const gap = 2;
  const h = 28;
  return (
    <div className={className}>
      <svg role="img" aria-label={sparklineAlt(values)} viewBox={`0 0 ${values.length * (w + gap) - gap} ${h}`} width={values.length * (w + gap) - gap} height={h} className="text-ink-2">
        {values.map((v, n) => {
          const bar = v === 0 ? 1 : Math.max(2, (v / max) * h);
          return <rect key={n} x={n * (w + gap)} y={h - bar} width={w} height={bar} fill="currentColor" />;
        })}
      </svg>
      <p className="num mt-0.5 text-2xs text-ink-3">
        {values.reduce((s, v) => s + v, 0)} commits, {values.length} months
      </p>
    </div>
  );
}
