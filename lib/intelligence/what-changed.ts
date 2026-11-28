/**
 * "What changed" noise filter. Official raised totals move by cents when the board recomputes
 * conversions. A funding change smaller than one dollar, or a donation under one dollar, is not
 * shown by default. The full record stays in the published dataset and the changes API.
 */
import type { ChangeRecord } from "@/lib/domain/schemas";

export const SUB_DOLLAR_CENTS = 100;

const raised = (v: unknown): number | null => {
  const n = (v as { officialRaisedCents?: unknown } | null | undefined)?.officialRaisedCents;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** True for a change whose dollar effect is under one dollar. Changes without a dollar effect are never noise. */
export function isSubDollarNoise(c: Pick<ChangeRecord, "kind" | "before" | "after">): boolean {
  if (c.kind === "funding_changed") {
    const a = raised(c.before);
    const b = raised(c.after);
    return a !== null && b !== null && Math.abs(b - a) < SUB_DOLLAR_CENTS;
  }
  if (c.kind === "donation_added") {
    const amt = (c.after as { amountUsdCents?: unknown } | null | undefined)?.amountUsdCents;
    return typeof amt === "number" && amt < SUB_DOLLAR_CENTS;
  }
  return false;
}

export function meaningfulChanges<T extends Pick<ChangeRecord, "kind" | "before" | "after">>(list: readonly T[]): T[] {
  return list.filter((c) => !isSubDollarNoise(c));
}
