import type { ReactNode } from "react";
import { ExternalLink } from "@/components/ui/button";
import { Note } from "@/components/ui/layout";
import { Money, formatDate } from "@/components/ui/money";
import { SourceLabel } from "@/components/ui/official-quote";
import type { Round1View } from "@/lib/intelligence/service";

/** ETH amounts in the report's own format (four decimals, en-US). Display only. */
function eth(v: string): string {
  return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(Number(v))} ETH`;
}
const positive = (v: string) => Number(v) > 0;

function Row({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="contents">
      <dt className="border-b border-rule py-1.5 text-ink-3 max-sm:border-0 max-sm:pb-0">{label}</dt>
      <dd className="border-b border-rule py-1.5 max-sm:pt-0">{children}</dd>
    </div>
  );
}

/**
 * Round 1 history (TheDAO / Giveth Ethereum Security QF round). The same component renders every
 * initiative dossier and organization profile. Facts and links only: amounts, dates, progress
 * update links and the stated reason for each match. Missing progress updates stay blank.
 */
export function Round1History({ view, subject }: { view: Round1View; subject: { label: string; href: string | null } }) {
  const round = view.round;
  return (
    <div data-testid="round1-history" className="max-w-[880px] space-y-4">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-ink-3">
        <SourceLabel kind="independent" />
        <span>
          Sources: <ExternalLink href={view.transparencyUrl}>TheDAO transparency report</ExternalLink> and <ExternalLink href={view.forumUrl}>Giveth forum results topic</ExternalLink>
        </span>
        {view.checkedAt && (
          <span data-testid="round1-checked">
            checked on <time dateTime={view.checkedAt} className="num">{formatDate(view.checkedAt)}</time>
          </span>
        )}
      </p>
      {view.stale.length > 0 && (
        <Note>
          The last fetch of {view.stale.map((s) => s.url).join(" and ")} failed; the copy retrieved on {formatDate(view.stale[0]?.retrievedAt)} is shown.
        </Note>
      )}
      {view.status === "unavailable" ? (
        <p className="text-sm text-ink-3">Round 1 records are unavailable because the sources could not be read.</p>
      ) : view.records.length === 0 ? (
        <p data-testid="round1-empty" className="text-sm">
          {view.emptyText}
        </p>
      ) : (
        <ol className="space-y-6">
          {view.records.map((r) => {
            const p = r.project;
            const proposalLinks = [...new Set(r.reasons.flatMap((x) => x.sourceUrls))].filter((u) => u.startsWith("https://initiatives.thedao.fund/"));
            return (
              <li key={r.projectId} data-testid="round1-record" data-status={r.status} className="border-t border-ink pt-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-sm font-semibold">
                    <ExternalLink href={p.transparencyUrl}>{p.name}</ExternalLink>
                  </h3>
                  <p className="text-2xs tracking-wide text-ink-3 uppercase">
                    {r.status === "possible" ? view.possibleText : `Match · ${r.level === "project" ? "same project" : "same organization"}`}
                  </p>
                </div>
                {r.status === "possible" && (
                  <p className="mt-1 text-xs">
                    Compare both records:{" "}
                    {proposalLinks.length > 0 ? (
                      proposalLinks.map((u) => (
                        <span key={u} className="mr-3">
                          <ExternalLink href={u}>Official proposal</ExternalLink>
                        </span>
                      ))
                    ) : subject.href ? (
                      <span className="mr-3">
                        <ExternalLink href={subject.href}>{subject.label}</ExternalLink>
                      </span>
                    ) : null}
                    <ExternalLink href={p.transparencyUrl}>Round 1 record</ExternalLink>
                  </p>
                )}
                <dl className="mt-2 grid grid-cols-[minmax(0,200px)_1fr] gap-x-6 border-t border-rule text-sm max-sm:grid-cols-1">
                  {p.liveStream ? (
                    <Row label="Amount shown in the report">
                      <span className="num">{eth(p.displayed.totalEth)}</span> · <Money cents={p.displayed.usdWhenSentCents} /> when sent{" "}
                      <span className="text-xs text-ink-3">
                        as shown on {formatDate(p.displayed.asOf)}; includes a live Superfluid stream, so the value changes over time
                      </span>
                    </Row>
                  ) : (
                    <Row label="Amount received">
                      <span className="num">{eth(p.totalEth)}</span> · <Money cents={p.usdWhenSentCents} /> <span className="text-xs text-ink-3">USD when sent</span>
                    </Row>
                  )}
                  <Row label="Breakdown">
                    <ul className="space-y-0.5">
                      {positive(p.components.matchingPoolEth) && (
                        <li>
                          TheDAO matching pool <span className="num">{eth(p.components.matchingPoolEth)}</span>
                        </li>
                      )}
                      {positive(p.components.extraRoundInflowEth) && (
                        <li>
                          Community-raised matching <span className="num">{eth(p.components.extraRoundInflowEth)}</span>
                        </li>
                      )}
                      {positive(p.components.otherDonorsEth) && (
                        <li>
                          Direct donations <span className="num">{eth(p.components.otherDonorsEth)}</span>{" "}
                          <span className="text-xs text-ink-3">
                            about <Money cents={p.components.otherDonorsUsdCents} /> at donation time
                          </span>
                        </li>
                      )}
                      {p.directGrants.map((g) => (
                        <li key={g.txHash}>
                          <ExternalLink href={`https://etherscan.io/tx/${g.txHash}`}>Direct grant</ExternalLink> <span className="num">{eth(g.amountEth)}</span>{" "}
                          <span className="text-xs text-ink-3">
                            <Money cents={g.amountUsdCents} /> when sent; one-off transfer outside the QF round
                          </span>
                        </li>
                      ))}
                      {p.liveStream?.explorerUrl && (
                        <li>
                          <ExternalLink href={p.liveStream.explorerUrl}>Live Superfluid stream</ExternalLink>
                        </li>
                      )}
                    </ul>
                  </Row>
                  <Row label="Date">
                    {round.period && <span>Round period {round.period}</span>}
                    {round.distributionAnnouncedAt && (
                      <span>
                        {round.period ? " · " : ""}distribution announced {formatDate(round.distributionAnnouncedAt)}
                        {round.distributionPostUrl && (
                          <>
                            {" "}
                            (<ExternalLink href={round.distributionPostUrl}>forum post</ExternalLink>)
                          </>
                        )}
                      </span>
                    )}
                  </Row>
                  <Row label="Progress update">{p.progressUpdateUrl ? <ExternalLink href={p.progressUpdateUrl}>{p.progressUpdateUrl.replace(/^https?:\/\//, "")}</ExternalLink> : null}</Row>
                  <Row label={r.status === "possible" ? "Why it is listed" : "Why it matches"}>
                    <ul className="space-y-0.5">
                      {r.reasons.map((x) => (
                        <li key={x.text}>{x.text}</li>
                      ))}
                    </ul>
                  </Row>
                  <Row label="Source">
                    <span className="text-xs">
                      <ExternalLink href={p.transparencyUrl}>{p.transparencyUrl.replace(/^https:\/\//, "")}</ExternalLink>, checked on{" "}
                      <time dateTime={r.checkedAt} className="num">
                        {formatDate(r.checkedAt)}
                      </time>
                    </span>
                  </Row>
                </dl>
              </li>
            );
          })}
        </ol>
      )}
      <Note>
        Per-project payment dates and donor counts are not published in the sources checked, so none are shown. Matches need a stated reason: a proposal link to the record, the same website or the same organization name. A shared word in two names is shown only as a possible match. Alphabetical (neutral) by Round 1 project name.
      </Note>
    </div>
  );
}
