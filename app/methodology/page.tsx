import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "@/components/ui/button";
import { Block, Note, PageHead } from "@/components/ui/layout";
import { StatusMark } from "@/components/ui/status";
import { EVIDENCE_STATUS_LABEL, type EvidenceStatus } from "@/lib/domain/schemas";
import { ONE_TS_DOMAINS, SECURITY_PROBLEMS, STAGE_ONE_TS } from "@/lib/domain/taxonomy";
import { BLIND_SPOT_LABEL } from "@/lib/intelligence/service";
import { OVERLAP_METHOD_VERSION, OVERLAP_THRESHOLDS } from "@/lib/intelligence/overlap";
import { METHODOLOGY_VERSION, METRICS, type MetricUnit } from "@/lib/metrics/registry";

export const metadata: Metadata = { title: "Methodology" };

const UNIT_LABEL: Record<MetricUnit, string> = { usd_cents: "US dollars (stored as integer cents)", count: "Count", ratio: "Ratio (shown as a percentage)", index: "Index from 0 to 1" };

const STATUS_DEFINITION: Record<EvidenceStatus, string> = {
  independently_verified: "Machine-observed evidence from a source other than the applicant confirms the statement, for example the GitHub API showing a cited repository is public, or an onchain receipt confirming a donation.",
  partially_supported: "Evidence supports part of the statement but does not confirm all of it, for example a merged pull request linked to a milestone marked complete.",
  applicant_reported: "Stated by the applicant in the proposal. Shown as a verbatim quote and not treated as fact.",
  not_independently_verified: "The research pipeline looked for supporting evidence and found none. This is not evidence that the statement is false.",
  officially_reported: "Recorded in the official TheDAO Security Fund API, such as goals, pledges and milestones.",
  future_target: "A planned deliverable or commitment. It cannot be verified until it happens.",
  contradicted: "Observed evidence conflicts with the statement.",
  disputed: "The statement is the subject of an unresolved dispute.",
  outdated: "Superseded by newer information.",
  not_applicable: "The status does not apply to this record.",
};

const ORDER: EvidenceStatus[] = ["independently_verified", "partially_supported", "applicant_reported", "not_independently_verified", "future_target", "officially_reported", "contradicted", "disputed", "outdated", "not_applicable"];

export default function MethodologyPage() {
  const groups = [
    { level: "cohort" as const, title: "Cohort metrics" },
    { level: "initiative" as const, title: "Initiative metrics" },
  ];
  return (
    <div className="space-y-12">
      <PageHead
        eyebrow={`Methodology ${METHODOLOGY_VERSION}`}
        title="How every figure and label on this site is produced"
        lede={
          <p>
            Official figures are copied from TheDAO Security Fund API. Everything else is either observed by the research pipeline from a public source or computed by a published rule. A truth audit re-checks the published dataset against the raw official records before each publication and blocks it on any failure.
          </p>
        }
        aside={
          <nav aria-label="On this page" className="text-xs text-ink-3">
            <ul className="space-y-1">
              {[
                ["metrics", "Metric registry"],
                ["statuses", "Evidence statuses"],
                ["taxonomy", "Security taxonomy"],
                ["hypotheses", "Relationship hypotheses"],
                ["questions", "Questions and blind spots"],
                ["identity", "Organization identity"],
                ["neutrality", "Neutrality rules"],
              ].map(([id, l]) => (
                <li key={id}>
                  <a href={`#${id}`} className="hover:text-accent">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        }
      />

      <Block id="metrics" title={`Metric registry (${METRICS.length} metrics)`} note="Missing inputs produce an explicit “Not available” with a reason, never a zero. All money is integer cents.">
        {groups.map((g) => (
          <div key={g.level} className="mb-8">
            <h3 className="eyebrow mb-2">{g.title}</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-xs">
                <caption className="sr-only">{g.title} with their definitions</caption>
                <thead>
                  <tr className="border-b border-ink text-left text-2xs tracking-wide text-ink-3 uppercase">
                    {["Metric", "Definition and formula", "Unit", "Source fields", "Required evidence", "Missing data", "Applies to", "Updated", "Version"].map((h) => (
                      <th key={h} scope="col" className="py-2 pr-3 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {METRICS.filter((m) => m.level === g.level).map((m) => (
                    <tr key={m.id} id={m.id} className="border-b border-rule align-top">
                      <th scope="row" className="py-2 pr-3 text-left font-medium">
                        {m.name}
                        <span className="num block text-2xs font-normal text-ink-3">{m.id}</span>
                      </th>
                      <td className="max-w-[320px] py-2 pr-3 text-ink-2">
                        {m.description}
                        <span className="num mt-1 block text-ink">{m.formula}</span>
                      </td>
                      <td className="py-2 pr-3">{UNIT_LABEL[m.unit]}</td>
                      <td className="num py-2 pr-3 break-words">{m.sourceFields.join(", ")}</td>
                      <td className="py-2 pr-3">{m.requiredEvidence}</td>
                      <td className="py-2 pr-3">{m.missingData}</td>
                      <td className="py-2 pr-3">{m.appliesTo.map((t) => (t === "rfp" ? "RFPs" : "Grants")).join(", ")}</td>
                      <td className="py-2 pr-3">{m.updateFrequency}</td>
                      <td className="num py-2">{m.methodologyVersion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </Block>

      <Block id="statuses" title="Evidence statuses" note="Every statement carries exactly one status. The mark is always shown with its label, so status never depends on color or shape alone.">
        <dl className="grid gap-x-10 gap-y-3 md:grid-cols-2">
          {ORDER.map((s) => (
            <div key={s} className="grid grid-cols-[150px_1fr] gap-3 border-b border-rule pb-3 text-sm max-sm:grid-cols-1">
              <dt>
                <StatusMark status={s} />
                <span className="mt-0.5 block text-2xs text-ink-3">{EVIDENCE_STATUS_LABEL[s]}</span>
              </dt>
              <dd className="text-ink-2">{STATUS_DEFINITION[s]}</dd>
            </div>
          ))}
        </dl>
      </Block>

      <Block
        id="taxonomy"
        title="Security lifecycle taxonomy"
        note={
          <>
            Informed by the Ethereum Foundation&apos;s <ExternalLink href="https://ethereum.org/reports/trillion-dollar-security/">Trillion Dollar Security</ExternalLink> overview and its six domains: {Object.values(ONE_TS_DOMAINS).join(", ")}. An initiative maps to a stage when one of its official categories is listed as a hint for that stage, or when its proposal text contains at least two distinct stage terms with three or more matches in total (whole-word matching). At most four stages per initiative; the stage with the most matches is primary.
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <caption className="sr-only">Lifecycle stages, their terms and official category hints</caption>
            <thead>
              <tr className="border-b border-ink text-left text-2xs tracking-wide text-ink-3 uppercase">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Stage
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Scope
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Terms
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Category hints
                </th>
                <th scope="col" className="py-2 font-medium">
                  Related domains
                </th>
              </tr>
            </thead>
            <tbody>
              {SECURITY_PROBLEMS.map((p) => (
                <tr key={p.id} className="border-b border-rule align-top">
                  <th scope="row" className="py-2 pr-3 text-left font-medium">
                    {p.label}
                  </th>
                  <td className="max-w-[300px] py-2 pr-3 text-ink-2">{p.description}</td>
                  <td className="num max-w-[320px] py-2 pr-3 text-ink-2">{p.terms.join(", ")}</td>
                  <td className="num py-2 pr-3">{p.officialCategoryHints.join(", ") || "None"}</td>
                  <td className="py-2">{STAGE_ONE_TS[p.id].map((k) => ONE_TS_DOMAINS[k]).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>

      <Block id="hypotheses" title={`Relationship hypotheses (${OVERLAP_METHOD_VERSION})`}>
        <div className="max-w-[860px] space-y-2 text-sm text-ink-2">
          <p>
            For every pair of initiatives the pipeline computes TF-IDF cosine similarity over the title, summary, problem, scope and deliverable sections and milestone names, plus shared lifecycle stages, shared standards, shared cited repositories and shared named backers.
          </p>
          <p>
            A pair is a hypothesis when similarity is at least {OVERLAP_THRESHOLDS.overlapSimilarity}, or when at least {OVERLAP_THRESHOLDS.minSignals} of four signals are present (similarity of at least {OVERLAP_THRESHOLDS.complementSimilarity}, a shared standard, a shared repository, a shared stage) and one of them is not a shared stage. It is labeled &ldquo;potentially overlaps&rdquo; when similarity is at least {OVERLAP_THRESHOLDS.overlapSimilarity} and one initiative&apos;s primary stage appears among the other&apos;s stages, otherwise &ldquo;potentially complements&rdquo;.
          </p>
          <p>
            Hypotheses are drawn with dashed lines and labeled as hypotheses everywhere. They never state a partnership, duplication or agreement. See{" "}
            <Link href="/research/collaboration" className="link">
              collaboration discovery
            </Link>
            .
          </p>
        </div>
      </Block>

      <Block id="questions" title="Milestone questions and research blind spots">
        <div className="grid gap-8 md:grid-cols-2">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            <li>No acceptance criterion, or one shorter than 40 characters.</li>
            <li>Adoption milestone: which third parties must adopt, and has any confirmed publicly?</li>
            <li>No target month recorded for an open milestone.</li>
            <li>More than half of the budget in one milestone.</li>
            <li>Marked complete without a linked artifact.</li>
            <li>A numeric adoption target in an adoption milestone&apos;s criteria.</li>
          </ul>
          <div className="text-sm text-ink-2">
            <p>Blind spot categories: {Object.values(BLIND_SPOT_LABEL).join("; ")}.</p>
            <Note className="mt-2">Questions are generated from what the record contains or lacks. Missing data is a reason to ask, never an accusation.</Note>
          </div>
        </div>
      </Block>

      <Block id="identity" title="Organization identity">
        <ul className="max-w-[860px] list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>Names are merged when they are identical after normalizing case and punctuation, when their official records link to the same website domain or GitHub owner, or when a researcher matched them with cited sources.</li>
          <li>Similar names without such evidence are kept separate and shown as &ldquo;not confirmed as the same entity&rdquo;.</li>
          <li>Anonymous or individual pledge labels are never merged with each other or with organizations.</li>
          <li>A self-pledge is a pledge whose backer resolves to the initiative&apos;s own recipient. It is listed for transparency, not as a concern.</li>
        </ul>
      </Block>

      <Block id="neutrality" title="Neutrality rules">
        <ul className="max-w-[860px] list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>No ranking, score, rating or voting recommendation is produced. Lists default to alphabetical order and say so.</li>
          <li>The same rules, thresholds and wording apply to every initiative and every category, including Proof of Audits, which has the same owner as this site.</li>
          <li>Applicant statements are quotations with their status. Only machine-observed evidence can make a statement verified or partially supported.</li>
          <li>Repository activity, reachability and counts describe what exists publicly. They are not measures of security quality.</li>
          <li>Hypothetical scenarios are labeled as exploration and never presented as predictions. No voting simulation is offered.</li>
          <li>Private workspace data stays in the reviewer&apos;s browser and is never part of public figures.</li>
        </ul>
      </Block>
    </div>
  );
}
