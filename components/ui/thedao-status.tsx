import { ExternalLink } from "@/components/ui/button";

/** Official vote app. This site never connects a wallet and never shows a countdown. */
export const VOTE_APP_URL = "https://initiatives.thedao.fund/vote";

/**
 * The only funding and voting line on the site. Live raised, pledged, goal and ask figures
 * stay on TheDAO. `href` is that initiative's official page, or the initiatives home.
 */
export function TheDaoStatus({ href, className }: { href: string; className?: string }) {
  return (
    <p className={className ?? "text-sm text-ink-2"} data-thedao-status>
      Funding and voting status →{" "}
      <ExternalLink href={href}>View on TheDAO</ExternalLink>
      {" · "}
      <ExternalLink href={VOTE_APP_URL}>Open the official vote app</ExternalLink>
    </p>
  );
}
