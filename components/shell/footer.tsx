import Link from "next/link";
import { ArrowUpRight } from "@/components/ui/icons";
import { formatDateTime } from "@/components/ui/money";

import { COI_SHORT, REPO_URL } from "@/lib/disclosure";

export { COI_SHORT, REPO_URL };

export function CoiStrip({ href }: { href: string }) {
  return (
    <div className="border-b border-rule bg-paper-2">
      <p className="mx-auto max-w-[1320px] px-5 py-1.5 text-2xs text-ink-2 md:px-8">
        {COI_SHORT}{" "}
        <Link href={href} className="link">
          Read the disclosure
        </Link>
      </p>
    </div>
  );
}

export function Footer({ meta }: { meta: { datasetVersion: string; officialGeneratedAt: string; methodologyVersion: string; sourceUrl: string } | null }) {
  const links = [
    { href: "/methodology", label: "Methodology" },
    { href: "/corrections", label: "Public corrections" },
    { href: "/status", label: "Data freshness" },
    { href: "/about", label: "About and conflict-of-interest disclosure" },
  ];
  return (
    <footer className="mt-20 border-t border-ink">
      <div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-8 text-xs text-ink-2 md:grid-cols-[1.3fr_1fr_1fr] md:px-8">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">ETHSecurity Intelligence</p>
          <p>Independent research on the ballot initiatives of TheDAO Security Fund. No ranking, no score and no voting advice is produced. Decisions remain with the reviewer.</p>
          <p>{COI_SHORT}</p>
        </div>
        <nav aria-label="Secondary">
          <p className="eyebrow mb-2">Reference</p>
          <ul className="space-y-1.5">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-accent">
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                GitHub repository <ArrowUpRight />
              </a>
            </li>
          </ul>
        </nav>
        <div>
          <p className="eyebrow mb-2">Data</p>
          {meta ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-ink-3">Official data</dt>
              <dd className="num">{formatDateTime(meta.officialGeneratedAt)}</dd>
              <dt className="text-ink-3">Dataset</dt>
              <dd className="num break-all">{meta.datasetVersion}</dd>
              <dt className="text-ink-3">Methodology</dt>
              <dd className="num">{meta.methodologyVersion}</dd>
              <dt className="text-ink-3">Source</dt>
              <dd className="break-all">
                <a href={meta.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                  TheDAO Security Fund API <ArrowUpRight />
                </a>
              </dd>
            </dl>
          ) : (
            <p>The published dataset could not be loaded.</p>
          )}
          <p className="mt-3 text-ink-3">Software under the MIT license. Initiative text and figures belong to their official sources.</p>
        </div>
      </div>
    </footer>
  );
}
