/**
 * Monetary arithmetic in integer US cents. Official values arrive as JSON numbers
 * with at most two decimals; we convert once at the boundary and never sum floats.
 */
export type Cents = number;

export function toCents(usd: number): Cents {
  if (!Number.isFinite(usd)) throw new RangeError(`Invalid USD amount: ${usd}`);
  return Math.round(usd * 100);
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) {
    if (!Number.isSafeInteger(v)) throw new RangeError(`Non-integer cents: ${v}`);
    total += v;
  }
  return total;
}

/** Ratio as a number in [0, 1+], or null when the denominator is zero/unknown. */
export function ratio(numerator: Cents, denominator: Cents | null | undefined): number | null {
  if (denominator === null || denominator === undefined || denominator === 0) return null;
  return numerator / denominator;
}

export function formatUsd(cents: Cents | null | undefined, opts: { compact?: boolean; precise?: boolean } = {}): string {
  if (cents === null || cents === undefined) return "Unavailable";
  const usd = cents / 100;
  if (opts.compact) {
    const abs = Math.abs(usd);
    if (abs >= 1_000_000) return `$${(usd / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
    if (abs >= 10_000) return `$${Math.round(usd / 1000)}k`;
    if (abs >= 1_000) return `$${(usd / 1000).toFixed(1)}k`;
  }
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.precise ? 2 : 0,
    maximumFractionDigits: opts.precise ? 2 : 0,
  });
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return `${(value * 100).toFixed(digits)}%`;
}
