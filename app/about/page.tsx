import { WhyAiList } from "@/components/about/why-ai";
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "@/components/ui/button";
import { CorrectionsSection } from "@/components/about/corrections";
import { FreshnessSection } from "@/components/about/status";
import { MethodologySection } from "@/components/about/methodology";
import { Block, PageHead } from "@/components/ui/layout";
import { BANNER_TEXT, COI_SHORT, isCoiOrganization, REPO_URL } from "@/lib/disclosure";
import { loadIntelligence } from "@/lib/intelligence/load";
import { fundingRelationships } from "@/lib/intelligence/service";

export const metadata: Metadata = { title: "About" };
export const dynamic = "force-dynamic";

const BOARD_REPO = "https://github.com/BlossomLabs/thedao-initiatives";

export default async function AboutPage() {
  const { dataset: d } = await loadIntelligence();
  const poa = d.initiatives.filter((i) => isCoiOrganization(i.organizationId));
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

      <nav aria-label="On this page" className="-mt-4 text-sm">
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {[
            ["#coi", "Disclosure"],
            ["#ai", "Why AI is here"],
            ["#how-research-is-made", "How research is made"],
            ["#methodology", "Methodology"],
            ["#freshness", "Data freshness"],
            ["#corrections", "Corrections"],
          ].map(([href, label]) => (
            <li key={href}>
              <a href={href} className="link">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Block id="ai" title="Why AI is here" className="scroll-mt-20">
        <WhyAiList />
      </Block>

      <section id="coi" aria-labelledby="coi-h" className="scroll-mt-20 border-2 border-ink px-5 py-4">
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
              Proof of Audits has also pledged to its own initiative. That pledge is treated the same way as every other self-pledge: the amount and status are on TheDAO, not copied here.
            </p>
          )}
          <p>Safeguards that apply to every initiative, including Proof of Audits:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>One pipeline, one set of rules, thresholds and wording for all {d.initiatives.length} initiatives.</li>
            <li>No ranking, score, rating or voting advice. Lists default to the order labeled &ldquo;Alphabetical (neutral)&rdquo;.</li>
            <li>Official figures are copied from the official API, and a truth audit blocks publication if any published figure or quote differs from the raw record.</li>
            <li>A banner at the top of every page reads: &ldquo;{BANNER_TEXT}&rdquo; The Proof of Audits dossier, its organization profile and the collaboration view repeat the disclosure.</li>
            <li>An automated test fails the build if any ranking, sorting, filtering, scoring or display code singles out Proof of Audits, and a second test checks that its dossier has the same sections, evidence rules and correction link as every other initiative.</li>
            <li>
              The code, data pipeline and published dataset are public in the <ExternalLink href={REPO_URL}>GitHub repository</ExternalLink>, so anyone can reproduce the results.
            </li>
            <li>
              Anyone can challenge a statement through{" "}
              <Link href="#corrections" className="link">
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
        <Block id="how-research-is-made" title="How the research is produced" className="scroll-mt-20">
          <p className="text-sm text-ink-2">
            An ingestion step reads the official API and stores content-addressed snapshots. A research step checks cited websites, GitHub repositories, milestone artifacts and onchain donations. A publication step builds the dataset, applies the truth audit and publishes only if it passes. Details are on the{" "}
            <Link href="#methodology" className="link">
              methodology
            </Link>{" "}
            and{" "}
            <Link href="#freshness" className="link">
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

      <section id="methodology" className="scroll-mt-20 space-y-8 border-t-2 border-ink pt-6">
        <MethodologySection />
      </section>
      <section id="freshness" className="scroll-mt-20 space-y-8 border-t-2 border-ink pt-6">
        <FreshnessSection />
      </section>
      <section id="corrections" className="scroll-mt-20 space-y-8 border-t-2 border-ink pt-6">
        <CorrectionsSection />
      </section>
    </div>
  );
}
