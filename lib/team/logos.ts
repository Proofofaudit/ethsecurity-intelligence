/**
 * Public logos. A logo is shown only when it is a local copy of an image published by the
 * organization itself (its own site) or its GitHub avatar, with the source recorded here.
 * The Content-Security-Policy allows images from this origin only, so remote images are never
 * requested. The map starts empty: no logo is invented, and every card falls back to a letter mark.
 */
export interface Logo {
  /** Path under /public, for example /logos/example.png. */
  src: string;
  alt: string;
  /** Where the image was taken from. Must be the organization's own site or a GitHub avatar. */
  sourceUrl: string;
}

export const LOGOS: Readonly<Record<string, Logo>> = {};

export const ALLOWED_LOGO_SOURCES = [/^https:\/\/avatars\.githubusercontent\.com\//, /^https:\/\/github\.com\/[A-Za-z0-9-]+\.png$/];

export function logoFor(initiativeId: string, logos: Readonly<Record<string, Logo>> = LOGOS): Logo | null {
  return logos[initiativeId] ?? null;
}

/** First letter of the organization or title, for the letter mark. */
export function letterMark(label: string): string {
  const m = label.trim().match(/\p{L}|\p{N}/u);
  return (m?.[0] ?? "?").toUpperCase();
}
