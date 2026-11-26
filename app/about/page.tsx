import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "@/components/ui/button";
import { Block, PageHead } from "@/components/ui/layout";
import { Money } from "@/components/ui/money";
import { COI_SHORT, REPO_URL } from "@/components/shell/footer";
import { loadIntelligence } from "@/lib/intelligence/load";
import { fundingRelationships } from "@/lib/intelligence/service";

export const metadata: Metadata = { title: "About and conflict-of-interest disclosure" };
export const revalidate = 300;

const POA_ORG = "org_proof-of-audits";
const BOARD_REPO = "https://github.com/BlossomLabs/thedao-initiatives";

export default async function AboutPage() {
  const { dataset: d } = await loadIntelligence();
  const poa = d.initiatives.filter((i) => i.organizationId === POA_ORG);
  const fr = fundingRelationships(d);
  const poaSelf = fr.selfPledges.filter((p) => poa.some((i) => i.id === p.initiativeId));
  const board = new URL(d.meta.officialSourceUrl).origin;

  return (
    <div className="space-y-12">
      <PageHead
        eyebrow="Reference · About"
        title="About this site, and a conflict of interest"
        lede={<p>ETHSecurity Intelligence is independent research on the {d.initiatives.length} initiatives on TheDAO Security Fund ballot. It helps badge holders and reviewers inspect claims, evidence, funding and milestones. It does not tell anyone how to vote.</p>}
      />

      <section aria-labelledby="coi-h" className="border-2 border-ink px-5 py-4">
        <p className="eyebrow">Conflict-of-interest disclosure</p>
        <h2 id="coi-h" className="mt-1 text-[20px] leading-7 font-semibold">{COI_SHORT.replace(/^Disclosure: t/, "T")}</h2>
        <div className="mt-3 max-w-[860px] space-y-2 text-sm text-ink-2">
          <p>
            Proof of Audits applies for funding in this round with{" "}
            {poa.map((i, n) => (
              <span key={i.id}>
                {n > 0 && ", "}
                <Link href={`/initiatives/${i.slug}`} className="link">
                  {i.title}
                </Link>
              </span>
            ))}
            {poa.length === 0 && "no initiative in the current cohort"}. The owner of this site therefore has a direct interest in how voters see that initiative and the initiatives most similar to it.
          </p>
          {poaSelf.length > 0 && (
            <p>
              Proof of Audits has also pledged to its own initiative (
              {poaSelf.map((p, n) => (
                <span key={p.pledgeId}>
                  {n > 0 && ", "}
                  <Money cents={p.amountCents} /> {p.status === "received" ? "received" : "outstanding"}
                </span>
              ))}
              ). It is listed under{" "}
              <Link href="/research/funding" className="link">
                self-pledges
              </Link>{" "}
              like every other self-pledge.
            </p>
          )}
          <p>Safeguards that apply to every initiative, including Proof of Audits:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>One pipeline, one set of rules, thresholds and wording for all {d.initiatives.length} initiatives.</li>
            <li>No ranking, score, rating or voting advice. Lists default to alphabetical order.</li>
            <li>Official figures are copied from the official API, and a truth audit blocks publication if any published figure or quote differs from the raw record.</li>
            <li>A short notice sits at the top of every page, and the Proof of Audits dossier, its organization profile and the collaboration view repeat the disclosure.</li>
            <li>
              The code, data pipeline and published dataset are public in the <ExternalLink href={REPO_URL}>GitHub repository</ExternalLink>, so anyone can reproduce the results.
            </li>
            <li>
              Anyone can challenge a statement through{" "}
              <Link href="/corrections" className="link">
                public corrections
              </Link>
              .
            </li>
          </ul>
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-2 [&>*]:min-w-0">
        <Block title="What this site does not do">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            <li>It does not rank or score initiatives, and it gives no voting advice.</li>
            <li>It has no sponsored placement. No initiative can pay to change how it is shown.</li>
            <li>It does not collect votes, wallet addresses or personal voting choices, and reviewers never sign in.</li>
            <li>It does not contact initiative teams or send messages on anyone&apos;s behalf.</li>
            <li>Its what-if scenarios are explorations of your assumptions, not predictions.</li>
          </ul>
        </Block>
        <Block title="Where voting happens">
          <p className="text-sm text-ink-2">
            Voting takes place only on TheDAO Security Fund&apos;s official platform at <ExternalLink href={board}>{board.replace(/^https:\/\//, "")}</ExternalLink>. This site links to each initiative&apos;s official page and never handles a vote.
          </p>
        </Block>
      </div>

      <div className="grid gap-10 lg:grid-cols-2 [&>*]:min-w-0">
        <Block title="How the research is produced">
          <p className="text-sm text-ink-2">
            An ingestion step reads the official API and stores content-addressed snapshots. A research step checks cited websites, GitHub repositories, milestone artifacts and onchain donations. A publication step builds the dataset, applies the truth audit and publishes only if it passes. Details are on the{" "}
            <Link href="/methodology" className="link">
              methodology
            </Link>{" "}
            and{" "}
            <Link href="/status" className="link">
              data freshness
            </Link>{" "}
            pages.
          </p>
        </Block>
        <Block title="Data and attribution">
          <ul className="space-y-1.5 text-sm text-ink-2">
            <li>
              Initiative text, figures, milestones and pledges come from the TheDAO Security Fund initiatives board and its public API (<ExternalLink href={board}>{board.replace(/^https:\/\//, "")}</ExternalLink>; board software:{" "}
              <ExternalLink href={BOARD_REPO}>BlossomLabs/thedao-initiatives</ExternalLink>). They belong to their authors and to TheDAO Security Fund.
            </li>
            <li>Repository facts come from the GitHub REST API; donation receipts from public Ethereum JSON-RPC endpoints.</li>
            <li>
              The lifecycle taxonomy is informed by the Ethereum Foundation&apos;s <ExternalLink href="https://ethereum.org/reports/trillion-dollar-security/">Trillion Dollar Security</ExternalLink> overview.
            </li>
            <li>This site&apos;s software is released under the MIT license.</li>
          </ul>
        </Block>
      </div>
    </div>
  );
}
