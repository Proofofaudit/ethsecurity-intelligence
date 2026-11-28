/**
 * Optional "Find my public profile" lookup (browser-only).
 *
 * The lookup may only ship a bundled list of public badge-holder entries when a verifiable public
 * source for it exists. Each entry may hold a handle, public organization names and public
 * expertise tags and nothing else (no names, contact data, email, LinkedIn or Telegram); the
 * strict schema below rejects any other field.
 *
 * Status: no such source exists. TheDAO's ETHSecurity Badges page, the initiatives API and the
 * BlossomLabs/thedao-initiatives repository publish no directory of holders with handles,
 * organizations or expertise (checked 26 Nov 2026), so BADGE_DIRECTORY is empty and the lookup is
 * shown disabled. This site does not compile such a list itself.
 */
import { z } from "zod";

export const BadgeHolderEntry = z
  .object({
    handle: z.string().min(1).max(60),
    organizations: z.array(z.string().min(1).max(120)).max(10),
    expertise: z.array(z.string().min(1).max(60)).max(10),
  })
  .strict();
export type BadgeHolderEntry = z.infer<typeof BadgeHolderEntry>;

export const BADGE_DIRECTORY_FIELDS = ["handle", "organizations", "expertise"] as const;

/** Source of the bundled entries; null while no verifiable public source exists. */
export const BADGE_DIRECTORY_SOURCE: { url: string; checkedAt: string } | null = null;

/** Bundled entries. Empty: see the file comment. */
export const BADGE_DIRECTORY: readonly BadgeHolderEntry[] = [];

export const PUBLIC_SUGGESTION_LABEL = "Suggested from public information. Edit freely.";

export const DIRECTORY_UNAVAILABLE_NOTE =
  "Find my public profile is off. TheDAO has not published a directory of badge holders with handles, organizations and expertise (checked on its ETHSecurity Badges page, its initiatives API and the BlossomLabs/thedao-initiatives repository, 26 Nov 2026), and this site does not compile one. Type your affiliations and pick focus chips instead.";

/** Minimum query length before any entry is shown, so no entry renders until the holder types. */
export const MIN_QUERY = 2;

/** Local search over the bundled entries; never touches the network. */
export function searchDirectory(entries: readonly BadgeHolderEntry[], query: string, max = 8): BadgeHolderEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY) return [];
  return entries.filter((e) => [e.handle, ...e.organizations, ...e.expertise].some((x) => x.toLowerCase().includes(q))).slice(0, max);
}
