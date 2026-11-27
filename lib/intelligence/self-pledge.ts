/**
 * Possible self-pledge detection, shared by the evidence card (Item 8) and later items. Pure and
 * conservative: a pledge is flagged only when the backer name, after normalization, equals a
 * recipient name or contains it as a whole-word sequence. "Safe" never matches "SafeGuard".
 * A flag is a prompt to check, never a finding: the label always says "unverified".
 */

export const SELF_PLEDGE_LABEL = "Backer name overlaps team name (possible self-pledge, unverified)";

/** Lowercase, strip diacritics, every run of non-alphanumerics becomes one space. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Recipient names shorter than this (after normalization, without spaces) are never used. */
const MIN_NAME_LENGTH = 3;

/**
 * True when the normalized backer name equals one of the normalized recipient names or contains
 * one as a whole-word sequence. Names that normalize to fewer than three letters or digits are
 * ignored, and anonymous labels never match because they carry no recipient name.
 */
export function namesOverlap(backer: string, recipientNames: readonly (string | null | undefined)[]): string | null {
  const b = ` ${normalizeName(backer)} `;
  if (!b.trim()) return null;
  const usable = recipientNames.filter((x): x is string => !!x && normalizeName(x).replace(/ /g, "").length >= MIN_NAME_LENGTH);
  // An exact match is reported before a contained one.
  return usable.find((raw) => ` ${normalizeName(raw)} ` === b) ?? usable.find((raw) => b.includes(` ${normalizeName(raw)} `)) ?? null;
}

export interface SelfPledgeSubject {
  recipientTeam: string | null;
  organization: { name: string; names: readonly string[] } | null;
}

/** Recipient names checked for overlap: the official recipient team and every recorded spelling of the recipient organization. */
export function recipientNames(s: SelfPledgeSubject): string[] {
  return [...new Set([s.recipientTeam, s.organization?.name, ...(s.organization?.names ?? [])].filter((x): x is string => !!x))];
}

/** Possible self-pledge check for one pledge company against one initiative's recipient names. */
export function possibleSelfPledge(company: string, s: SelfPledgeSubject): { flagged: boolean; matchedName: string | null; label: string | null } {
  const hit = namesOverlap(company, recipientNames(s));
  return { flagged: hit !== null, matchedName: hit, label: hit ? SELF_PLEDGE_LABEL : null };
}
