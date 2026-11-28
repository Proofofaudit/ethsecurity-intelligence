/**
 * TheDAO ask: what TheDAO's pool would still top up for one initiative.
 *
 *   ask = min(cap, max(0, goal − raised)),  cap = $200,000
 *
 * `raised` is the official raised figure (outstanding pledges + confirmed donations; received
 * pledges are already inside donations and are never added twice). The $200,000 cap is the
 * vote setting `capUsd` in BlossomLabs/thedao-initiatives shared/vote.ts ("what TheDAO would
 * top up at most"). Over-funded or exactly funded initiatives ask 0. A missing or invalid input
 * gives null (shown as "unavailable"), never 0.
 *
 * This is not the remaining funding gap: the gap is max(0, goal − raised) without the cap.
 */
import type { Cents } from "@/lib/util/money";

export const THEDAO_ASK_CAP_USD = 200_000;
export const THEDAO_ASK_CAP_CENTS: Cents = THEDAO_ASK_CAP_USD * 100;

const valid = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;

export function theDaoAskCents(goalCents: number | null | undefined, raisedCents: number | null | undefined): Cents | null {
  if (!valid(goalCents) || !valid(raisedCents)) return null;
  return Math.min(THEDAO_ASK_CAP_CENTS, Math.max(0, goalCents - raisedCents));
}

/** Remaining funding gap (uncapped). Null when an input is unavailable. */
export function remainingGapCents(goalCents: number | null | undefined, raisedCents: number | null | undefined): Cents | null {
  if (!valid(goalCents) || !valid(raisedCents)) return null;
  return Math.max(0, goalCents - raisedCents);
}
