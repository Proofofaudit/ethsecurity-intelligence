import type { Metadata } from "next";
import Link from "next/link";
import { NEUTRAL_SORT_LABEL } from "@/lib/neutralLanguage";
import { Block, Note, PageHead, Stat } from "@/components/ui/layout";
import { Money, Pct } from "@/components/ui/money";
import { StatusMark } from "@/components/ui/status";
import { loadIntelligence } from "@/lib/intelligence/load";
import { displayName, fundingRelationships } from "@/lib/intelligence/service";
import { cohortMetrics } from "@/lib/metrics/compute";
import { cn } from "@/lib/util/cn";

export const metadata: Metadata = { title: "Funding relationships" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function FundingPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const sort = one(sp.sort) === "amount" ? "amount" : "name";
  const { dataset: d } = await loadIntelligence();
  const fr = fundingRelationships(d);
  const cm = cohortMetrics(d);
  const byId = new Map(d.initiatives.map((i) => [i.id, i]));
  const name = (id: string) => {
    const i = byId.get(id);
    return i ? displayName(d, i) : id;
  };
  const orgs = new Map(d.organizations.map((o) => [o.id, o]));
  const backers = sort === "name" ? [...fr.backers].sort((a, b) => a.name.localeCompare(b.name)) : fr.backers;
  const anonymous = fr.backers.filter((b) => b.anonymous);
  const pledgedOut = fr.backers.reduce((s, b) => s + b.pledgedCents, 0);
  const received = fr.backers.reduce((s, b) => s + b.receivedCents, 0);

  return (
    <div className="space-y-10">
      <PageHead
        eyebrow="Research · Funding relationships"
        title="Who has pledged to which initiatives"
        lede={<p>Built from the official pledge records. Backer names are matched only by identical spelling (ignoring case and punctuation), a shared official website domain or GitHub owner, or cited evidence. Similar names that do not meet that bar are listed separately and never merged.</p>}
      />

      <dl className="grid grid-cols-2 gap-px border-y border-ink bg-rule sm:grid-cols-3 xl:grid-cols-6 [&>div]:bg-paper [&>div]:px-4 [&>div]:py-4">
        <Stat label="Pledge records" value={<span className="num">{d.pledges.length}</span>} />
        <Stat label="Distinct backers" value={<span className="num">{fr.backers.length}</span>} sub={`${anonymous.length} anonymous labels, kept separate`} />
        <Stat label="All pledges" value={<Money cents={fr.totalPledgedCents} />} sub="Outstanding plus received" />
        <Stat label="Outstanding" value={<Money cents={pledgedOut} />} sub={<>Received <Money cents={received} /></>} />
        <Stat label="Backers of more than one initiative" value={<span className="num">{fr.multiInitiativeBackers.length}</span>} />
        <Stat label="Top-5 backer share" value={<Pct value={fr.concentration?.value ?? null} reason={fr.concentration?.unavailableReason ?? undefined} />} sub="Of all pledged amounts" />
      </dl>
      <Note className="max-w-[880px]" data-funding-context>
        Pledges are one part of official raised. Across the {d.initiatives.length} cohort initiatives: raised <Money cents={cm["cohort.raised"]?.value ?? null} /> (outstanding pledges <Money cents={cm["cohort.pledged_outstanding"]?.value ?? null} /> + confirmed donations <Money cents={cm["cohort.donated"]?.value ?? null} />, which already include <Money cents={cm["cohort.received_pledges"]?.value ?? null} /> of received pledges), goal <Money cents={cm["cohort.goal"]?.value ?? null} />, TheDAO ask{" "}
        <Money cents={cm["cohort.thedao_ask"]?.value ?? null} reason={cm["cohort.thedao_ask"]?.unavailableReason ?? undefined} /> (capped at $200,000 per initiative).
      </Note>

      <Block
        title="Backers"
        note={
          <>
            Order: {sort === "name" ? `${NEUTRAL_SORT_LABEL}.` : "total pledged, as you chose."}{" "}
            <Link href={sort === "name" ? "/research/funding?sort=amount" : "/research/funding"} className="link">
              {sort === "name" ? "Sort by total pledged" : NEUTRAL_SORT_LABEL}
            </Link>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Every backer with pledge records</caption>
            <thead>
              <tr className="border-b border-ink text-left text-2xs tracking-wide text-ink-3 uppercase">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Backer
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Initiatives backed
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Records
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Outstanding
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Received
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {backers.map((b) => (
                <tr key={b.backerId} className="border-b border-rule align-top">
                  <td className="py-2 pr-3">
                    <Link href={`/entities/organization/${encodeURIComponent(b.backerId)}`} className="font-medium hover:text-accent">
                      {b.name}
                    </Link>
                    {b.anonymous && <span className="ml-2 text-2xs text-ink-3">anonymous label</span>}
                    {orgs.get(b.backerId)?.kind === "both" && <span className="ml-2 text-2xs text-ink-3">also a recipient</span>}
                  </td>
                  <td className="py-2 pr-3 text-xs text-ink-2">
                    {b.initiatives.map((id, i) => (
                      <span key={id}>
                        {i > 0 && ", "}
                        <Link href={`/initiatives/${byId.get(id)?.slug}#financial`} className="hover:text-accent">
                          {name(id)}
                        </Link>
                      </span>
                    ))}
                  </td>
                  <td className="num py-2 pr-3 text-right">{b.records}</td>
                  <td className="py-2 pr-3 text-right">
                    <Money cents={b.pledgedCents} />
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Money cents={b.receivedCents} />
                  </td>
                  <td className="py-2 text-right font-medium">
                    <Money cents={b.totalCents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>

      <div className="grid gap-10 lg:grid-cols-2 [&>*]:min-w-0">
        <Block title="Funding overlap: backers of several initiatives" note="Backers whose pledges go to more than one cohort initiative. Common in grant rounds; listed for transparency.">
          {fr.multiInitiativeBackers.length === 0 ? (
            <Note>None.</Note>
          ) : (
            <ul className="divide-y divide-rule text-sm">
              {[...fr.multiInitiativeBackers]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((b) => (
                  <li key={b.backerId} className="py-2">
                    <Link href={`/entities/organization/${encodeURIComponent(b.backerId)}`} className="font-medium hover:text-accent">
                      {b.name}
                    </Link>{" "}
                    <span className="num text-xs text-ink-3">{b.initiatives.length} initiatives</span>
                    <p className="mt-0.5 text-xs text-ink-2">{b.initiatives.map(name).join(", ")}</p>
                  </li>
                ))}
            </ul>
          )}
        </Block>
        <Block title="Self-pledges" note={fr.selfPledgeNote}>
          {fr.selfPledges.length === 0 ? (
            <Note>None.</Note>
          ) : (
            <ul className="divide-y divide-rule text-sm">
              {fr.selfPledges.map((p) => (
                <li key={p.pledgeId} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <Link href={`/initiatives/${byId.get(p.initiativeId)?.slug}#financial`} className="font-medium hover:text-accent">
                      {name(p.initiativeId)}
                    </Link>
                    <span className="text-xs text-ink-3"> · {p.backer}</span>
                  </span>
                  <span className="shrink-0 text-xs">
                    <Money cents={p.amountCents} /> <span className="text-ink-3">{p.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>

      <div className="grid gap-10 lg:grid-cols-2 [&>*]:min-w-0">
        <Block title="Similar names, not merged" note="Pairs of names that look alike but share no official website and no cited evidence. They are counted as separate backers or recipients.">
          {fr.candidates.length === 0 ? (
            <Note>None.</Note>
          ) : (
            <ul className="divide-y divide-rule text-sm">
              {fr.candidates.map((a) => (
                <li key={a.id} className="py-2">
                  <p>
                    <Link href={`/entities/organization/${encodeURIComponent(a.organizationId)}`} className="font-medium hover:text-accent">
                      {orgs.get(a.organizationId)?.name ?? a.alias}
                    </Link>{" "}
                    <span className="text-ink-3">and</span>{" "}
                    {a.candidateOrganizationId ? (
                      <Link href={`/entities/organization/${encodeURIComponent(a.candidateOrganizationId)}`} className="font-medium hover:text-accent">
                        {orgs.get(a.candidateOrganizationId)?.name ?? a.candidateOrganizationId}
                      </Link>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-st-partial">Not confirmed as the same entity.</p>
                  <p className="text-xs text-ink-3">{a.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </Block>
        <Block title="Previous funding mentioned in proposals" note="Statements about earlier grants or backing, found by pattern in the proposal text. They are applicant statements, not verified records.">
          {d.previousGrants.length === 0 ? (
            <Note>None found.</Note>
          ) : (
            <ul className="divide-y divide-rule text-sm">
              {d.previousGrants.map((g) => (
                <li key={g.id} className="py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link href={`/initiatives/${byId.get(g.initiativeId)?.slug}#financial`} className="font-medium hover:text-accent">
                      {name(g.initiativeId)}
                    </Link>
                    <StatusMark status={g.status} />
                  </div>
                  <blockquote className={cn("mt-1 border-l-2 border-rule-2 pl-3 text-xs text-ink-2")}>&ldquo;{g.statement}&rdquo;</blockquote>
                  {g.amountCents !== null && (
                    <p className="mt-0.5 text-xs text-ink-3">
                      Amount stated: <Money cents={g.amountCents} />
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>
    </div>
  );
}
