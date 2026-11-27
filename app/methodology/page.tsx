import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "@/components/ui/button";
import { Block, Note, PageHead } from "@/components/ui/layout";
import { StatusMark } from "@/components/ui/status";
import { EVIDENCE_STATUS_LABEL, type EvidenceStatus } from "@/lib/domain/schemas";
import { ONE_TS_DOMAINS, SECURITY_PROBLEMS, STAGE_ONE_TS } from "@/lib/domain/taxonomy";
import { BLIND_SPOT_LABEL } from "@/lib/intelligence/service";
import { ACTIVITY_NOTE, AUDIT_LINK_NOTE, CACHE_NOTE, EVIDENCE_CARD_SECTIONS, NO_LINKS_TEXT } from "@/lib/intelligence/evidence-card";
import { OVERLAP_METHOD_VERSION, OVERLAP_THRESHOLDS } from "@/lib/intelligence/overlap";
import { SELF_PLEDGE_LABEL } from "@/lib/intelligence/self-pledge";
import { EXISTING_WORK_SECTIONS, LIST_ONLY_NAMES, NOT_A_PARTY, OPEN_QUESTION_NOTICE, OPEN_QUESTION_RULES, OPEN_QUESTIONS_VERSION } from "@/lib/intelligence/open-questions";
import { HYPOTHESIS_NOTICE, SIMILAR_LABELS, SIMILAR_METHOD_VERSION, SIMILAR_SECTIONS, SIMILAR_THRESHOLDS, TECHNOLOGIES } from "@/lib/intelligence/similar";
import { NEUTRAL_SORT_LABEL } from "@/lib/neutralLanguage";
import { CONTACT_RETENTION_DAYS } from "@/lib/corrections";
import { METHODOLOGY_VERSION, METRICS, type MetricUnit } from "@/lib/metrics/registry";
import { PRIVACY_LOCAL_KEYS } from "@/lib/privacy";
import { MODE_BY_ID } from "@/lib/skills/modes";
import { AFFILIATED_WITH, GENERIC_WORDS, MAY_BE_AFFILIATED, OPTIONAL_WORDS, POSSIBLY_OWN, SAME_NAME_OPTIONAL_WORDS } from "@/lib/vote/affiliation";
import { DIRECTORY_UNAVAILABLE_NOTE } from "@/lib/vote/badge-directory";
import { FOCUS_MODE_TABLE, KEYWORD_ENDINGS } from "@/lib/vote/interest";

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
                ["affiliation", "Affiliation flags"],
                ["interest", "May interest you"],
                ["privacy", "Privacy"],
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

      <Block id="metrics" title={`Metric registry (${METRICS.length} metrics)`} note="Missing inputs produce an explicit “Unavailable” with a reason, never a zero. All money is integer cents.">
        {groups.map((g) => (
          <div key={g.level} className="mb-8">
            <h3 className="eyebrow mb-2">{g.title}</h3>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${g.title} table, scrolls sideways`}>
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
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Lifecycle stages table, scrolls sideways">
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

      <Block id="similar" title={`Similar initiatives (${SIMILAR_METHOD_VERSION})`} note="Fixed rules over the official record. No model, no score. The same input always gives the same pairs.">
        <div className="max-w-[860px] space-y-2 text-sm text-ink-2">
          <p>
            For every pair of initiatives the engine looks for five signals: a shared official category (weak); a shared affiliation group in TheDAO&apos;s vote manifest (strong); two-word phrases both proposals use in the {SIMILAR_SECTIONS.map((s) => `"${s}"`).join(" and ")} sections (strong from {SIMILAR_THRESHOLDS.keywordStrongMin} phrases, weak with one); standards (ERC, EIP and RIP numbers) and named technologies both proposals name in those sections (strong); and a public backer that pledged to both (strong, anonymous backers excluded).
          </p>
          <p>
            Phrases leave out stopwords, proposal boilerplate, phrases made only of generic words such as &ldquo;ethereum security&rdquo;, and phrases that more than {SIMILAR_THRESHOLDS.keywordMaxInitiatives} initiatives use. Technology names match case-sensitively as whole words, so &ldquo;safe&rdquo; the adjective, &ldquo;Safe Harbor&rdquo; and &ldquo;ZKsync&rdquo; do not count. Named technologies: {TECHNOLOGIES.map((t) => t.name).join(", ")}.
          </p>
          <p>
            A pair is shown only when it has a phrase or technology signal, quoted with one sentence from each proposal and a link to the official section, and when it is more than one weak signal. It is labeled &ldquo;{SIMILAR_LABELS[2]}&rdquo; when both initiatives have the same recipient organization, &ldquo;{SIMILAR_LABELS[0]}&rdquo; when they share an official category, and &ldquo;{SIMILAR_LABELS[1]}&rdquo; otherwise. RFPs have no recipient and follow the same rules. Every pair reads &ldquo;{HYPOTHESIS_NOTICE}&rdquo;. Lists are {NEUTRAL_SORT_LABEL.toLowerCase()} by title. No AI hypotheses are generated; the site runs no model.
          </p>
          <p>
            The Research filter &ldquo;Possible overlaps&rdquo; lists initiatives with at least one such pair. &ldquo;Compare these&rdquo; opens the comparison with both initiatives selected.
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

      <Block id="open-questions" title={`Open questions (${OPEN_QUESTIONS_VERSION})`} note={OPEN_QUESTION_NOTICE}>
        <div className="max-w-[860px] space-y-3 text-sm text-ink-2">
          <p>
            Eight fixed rules turn structural gaps in the official record into neutral questions. Each rule has one template, so the wording is the same for every initiative; only a milestone number or a backer name is filled in. Nothing is generated by a model. Each question shows its category, the rule, the field it read or the quoted text, and a link to the source. Dossiers list them by category, then rule number; the{" "}
            <Link href="/research/questions" className="link">
              aggregate view
            </Link>{" "}
            lists the counts per category for every initiative, {NEUTRAL_SORT_LABEL.toLowerCase()} by title.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            {OPEN_QUESTION_RULES.map((r) => (
              <li key={r.id}>
                <span className="text-ink">{r.label}</span> ({r.category}; field <code className="text-xs">{r.field}</code>): &ldquo;{r.template}&rdquo;
              </li>
            ))}
          </ol>
          <p>
            Rule 1 does not ask about milestones marked complete. Rule 3 counts a link to a GitHub, GitLab, Codeberg or Bitbucket repository, or a link on the recipient&apos;s own domain (the official recipient URL, the organization website, or a domain named after the recipient). Rule 4 reads the criteria of open adoption milestones and lists the parties they name: names in an enumerated list (&ldquo;from this list: A, B, C&rdquo;), and names found in such lists elsewhere in the cohort or in organization names, mentioned on their own. Names after &ldquo;outside&rdquo;, &ldquo;excluding&rdquo; or &ldquo;independent of&rdquo; and the recipient&apos;s own names are left out. Never counted as parties: {NOT_A_PARTY.join(", ")}. Counted only inside a list: {LIST_ONLY_NAMES.join(", ")}. Rule 5 uses the same whole-word name check as the evidence card and is labeled unverified. Rule 8 reads statements the claims pipeline classified as existing integrations or production use in the {EXISTING_WORK_SECTIONS.join(", ")} sections, with no URL or written-out link in the sentence and no supporting evidence.
          </p>
          <Note>
            &ldquo;Mark as asked or resolved&rdquo; and &ldquo;Copy as list&rdquo; work in your browser only. The app never sends questions to anyone and has no messaging or email feature.
          </Note>
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

      <Block id="evidence-card" title="Evidence card" note="The same six sections, in the same order, for every initiative. Each item has a source label, a source link and the date it was checked.">
        <ul className="max-w-[860px] list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>Sections: {EVIDENCE_CARD_SECTIONS.map((s) => s.title).join(", ")}. An empty section reads &ldquo;Not found&rdquo;; the last section lists what was searched and not found, such as &ldquo;{NO_LINKS_TEXT}&rdquo;.</li>
          <li>Shipped work lists the official site, sites and products linked in the proposal, and every repository the proposal links, with last push, latest release and license from the GitHub API. Commit counts are raw facts. {ACTIVITY_NOTE}</li>
          <li>Funding shows pledged, received pledges and donated as three separate official figures. Received pledges are already inside donated, so the figures are never added together. Every backer is named as in the official pledge record.</li>
          <li>&ldquo;{SELF_PLEDGE_LABEL}&rdquo; appears when the backer name, after folding case, accents and punctuation, equals the recipient team or a recorded name of the recipient organization, or contains one as whole words. &ldquo;Safe&rdquo; never matches &ldquo;SafeGuard&rdquo;.</li>
          <li>Team and track record lists public profiles and links from the proposal&apos;s team section. Email addresses, phone numbers and messenger links are never shown.</li>
          <li>Audits or reviews lists only proposal links whose address or link text names an audit or security review report. {AUDIT_LINK_NOTE}</li>
          <li>A link whose check failed is flagged &ldquo;Link did not respond when checked on &hellip;&rdquo; and a repository the GitHub API did not return is flagged &ldquo;Repository not found when checked on &hellip;&rdquo;. Bot protection or rate limits (HTTP 403, 429, 503) make a check inconclusive; the cached result is shown with its age at publication. {CACHE_NOTE}</li>
        </ul>
      </Block>

      <Block id="neutrality" title="Neutrality rules">
        <ul className="max-w-[860px] list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>No ranking, score, rating or voting advice is produced. Lists default to alphabetical order and say so.</li>
          <li>The same rules, thresholds and wording apply to every initiative and every category, including Proof of Audits, which has the same owner as this site.</li>
          <li>Applicant statements are quotations with their status. Only machine-observed evidence can make a statement verified or partially supported.</li>
          <li>Repository activity, reachability and counts describe what exists publicly. They are not measures of security quality.</li>
          <li>Hypothetical scenarios are labeled as exploration and never presented as predictions. No voting simulation is offered.</li>
          <li>Private workspace data stays in the reviewer&apos;s browser and is never part of public figures.</li>
        </ul>
      </Block>

      <Block id="affiliation" title="Affiliation flags" note="Flags make possible conflicts visible. No initiative is ever hidden or reordered because of them.">
        <ul className="max-w-[860px] list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>
            &ldquo;{AFFILIATED_WITH} &hellip;&rdquo; lists the other initiatives that share an affiliation group with an initiative in TheDAO&apos;s official vote manifest. It is shown only when the manifest is confirmed to align with the cohort; otherwise the flag is off and the page says why.
          </li>
          <li>
            My affiliations in My Workspace compares the organizations you list with each initiative&apos;s manifest groups, official recipient team and the published organization aliases (see Organization identity). A match shows an amber &ldquo;{MAY_BE_AFFILIATED}&rdquo; tag with the matched text, and Ballot Prep shows &ldquo;{POSSIBLY_OWN}&rdquo; next to the tier choice. You can mark or unmark any initiative by hand; the matching runs in your browser.
          </li>
          <li>
            Matching folds case and accents and splits text into words. An entry is also tried as the text inside and outside its parentheses, so &ldquo;Security Alliance (SEAL)&rdquo; is tried as &ldquo;Security Alliance&rdquo; and &ldquo;SEAL&rdquo; too. Official texts are split into name segments the same way, and also at commas, semicolons, slashes and at hyphens in a part without spaces (&ldquo;ValOS-Lionscraft&rdquo; gives &ldquo;ValOS&rdquo; and &ldquo;Lionscraft&rdquo;). A term matches when the full texts are equal without punctuation, or when its distinctive (non-generic) words are the first distinctive words of a segment, in order, the segment&apos;s words before them are in the term, each other word of the term is in the segment or optional (a number counts as optional), and, if the term adds such a word, the segment adds nothing but connecting words. The reverse (a segment naming the start of your entry) counts only when the segment has two or more distinctive words. So &ldquo;SEAL&rdquo; matches &ldquo;Security Alliance (SEAL) Intel&rdquo;, &ldquo;Kann&rdquo; matches &ldquo;Kann Audits&rdquo;, &ldquo;Blossom Labs Ltd&rdquo; matches &ldquo;Blossom Labs&rdquo;, &ldquo;Nethermind Security&rdquo; matches &ldquo;Nethermind&rdquo;, &ldquo;SEAL 911&rdquo; matches &ldquo;SEAL&rdquo; and &ldquo;Kleros DAO&rdquo; matches &ldquo;Kleros&rdquo;, while &ldquo;Intel&rdquo; does not match &ldquo;Security Alliance (SEAL) Intel&rdquo;, &ldquo;Bloom&rdquo; does not match &ldquo;Sem Bloom&rdquo;, &ldquo;Alliance&rdquo; does not match &ldquo;Security Alliance&rdquo;, &ldquo;Runtime Foundation&rdquo; does not match &ldquo;Runtime Capital&rdquo;, &ldquo;Runtime Verification&rdquo; does not match &ldquo;Runtime Capital&rdquo; and &ldquo;Walnut Capital&rdquo; does not match &ldquo;Walnut&rdquo;. A single word that starts an official name matches it (&ldquo;Runtime&rdquo; matches &ldquo;Runtime Capital&rdquo;); the tag shows the matched text so you can mark it as not yours.
          </li>
          <li>
            A manifest group that is exactly a name of one organization in the identity table also carries that organization&apos;s other names, so &ldquo;Argot Collective&rdquo; matches both initiatives in group &ldquo;Argot&rdquo; and &ldquo;Security Alliance&rdquo; matches all four initiatives in group &ldquo;SEAL&rdquo;. The tag then reads &ldquo;manifest affiliation group &lsquo;Argot&rsquo; (organization name &lsquo;Argot Collective&rsquo;)&rdquo;.
          </li>
          <li>
            Generic words never match on their own, so &ldquo;Ethereum Foundation&rdquo; matches nothing unless an official text is exactly that: <span className="text-xs">{GENERIC_WORDS.join(", ")}</span>.
          </li>
          <li>
            Optional words may be added or left out without changing the organization meant: <span className="text-xs">{OPTIONAL_WORDS.join(", ")}</span>. These may be added only when the official text has no word your entry lacks: <span className="text-xs">{SAME_NAME_OPTIONAL_WORDS.join(", ")}</span>, so &ldquo;Kleros DAO&rdquo; matches &ldquo;Kleros&rdquo; but &ldquo;Alliance DAO&rdquo; does not match &ldquo;Security Alliance&rdquo;. Any other generic word, such as &ldquo;Capital&rdquo; or &ldquo;Ventures&rdquo;, is part of the name when present.
          </li>
          <li>{DIRECTORY_UNAVAILABLE_NOTE}</li>
        </ul>
      </Block>

      <Block id="interest" title="May interest you" note="An explained starting set built in your browser. No ranking, score, match percentage or advice.">
        <ul className="mb-4 max-w-[860px] list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>Inputs are local: focus chips (the official categories and the AI Lab research modes) and keywords you type.</li>
          <li>A category chip matches initiatives with that official category. A research mode matches initiatives in its mapped categories, or else whose official title, summary or listed standards contain one of its keywords (whole words, any case; the last word of a keyword may end in {KEYWORD_ENDINGS.join(", ")}, a final consonant plus &ldquo;y&rdquo; may become &ldquo;ies&rdquo; or &ldquo;ied&rdquo;, and a final consonant plus &ldquo;e&rdquo; drops the &ldquo;e&rdquo; before &ldquo;ed&rdquo;, &ldquo;ing&rdquo;, &ldquo;er&rdquo; and &ldquo;ers&rdquo;, so &ldquo;attack&rdquo; finds &ldquo;attacks&rdquo;, &ldquo;bounty&rdquo; finds &ldquo;bounties&rdquo; and &ldquo;secure&rdquo; finds &ldquo;securing&rdquo;). A typed keyword matches the same fields. When the official text uses another form, the reason quotes it.</li>
          <li>Results are grouped by the focus they match, in the order of the chips; inside each group the order is alphabetical. Every item states why it matched, with the matched text, and links to evidence: the official initiative page and, when one exists, an independent source for a supported statement. Items without an evidence link are left out.</li>
        </ul>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Research mode mapping table">
          <table className="w-full min-w-[640px] max-w-[1100px] border-y border-rule text-sm" data-mode-table>
            <caption className="mb-2 text-left text-xs text-ink-3">Research mode to category and keyword mapping. One table in the code (lib/vote/interest.ts) feeds this page and the workspace view.</caption>
            <thead>
              <tr className="border-b border-rule text-left text-xs text-ink-3">
                <th className="py-1.5 pr-4 font-medium">Research mode</th>
                <th className="py-1.5 pr-4 font-medium">Official categories</th>
                <th className="py-1.5 font-medium">Keywords</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {FOCUS_MODE_TABLE.map((m) => (
                <tr key={m.mode} className="align-top">
                  <td className="py-1.5 pr-4 font-medium">{MODE_BY_ID.get(m.mode)?.label ?? m.mode}</td>
                  <td className="py-1.5 pr-4 text-ink-2">{m.categories.length ? m.categories.join(", ") : "None (keywords only)"}</td>
                  <td className="py-1.5 text-ink-2">{m.keywords.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>

      <Block id="privacy" title="Privacy" note="This list is checked against the code by an automated test. Nothing personal leaves your browser unless you submit a correction.">
        <div className="grid max-w-[1100px] gap-8 text-sm text-ink-2 lg:grid-cols-3 [&>*]:min-w-0">
          <div>
            <h3 className="eyebrow mb-2">Stored only in your browser</h3>
            <p className="mb-2">Kept in this browser&apos;s local storage, never sent to the server. Clearing this site&apos;s data in the browser, or the Clear button in My Workspace, removes it.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <code className="num text-xs">{PRIVACY_LOCAL_KEYS.workspace}</code>: My Workspace. Saved initiatives with your priority and review state, saved searches, bookmarked statements with the status you saw, saved comparisons, notes, open questions, research priorities, draft assessments, the last page you visited and when you last reviewed the change log. Your Ballot Prep draft (S, A and B tiers) and the TheDAO asks you last saw, used for &ldquo;since your last visit&rdquo;, are kept in the same entry. Your affiliations with the initiatives you marked or unmarked by hand, and your May interest you focus chips and keywords, and the open questions you marked as asked or resolved, are kept in the same entry. So are your review progress states and reasons, the record of what you saw on your last visit (used for &ldquo;Since your last visit&rdquo;), and the briefing items you marked as read.
              </li>
              <li>
                <code className="num text-xs">{PRIVACY_LOCAL_KEYS.labTemplates}</code>: AI Lab templates you save.
              </li>
              <li>
                <code className="num text-xs">{PRIVACY_LOCAL_KEYS.theme}</code>: your light, dark or system theme choice.
              </li>
            </ul>
          </div>
          <div>
            <h3 className="eyebrow mb-2">Stored on the server</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>The published research dataset, which is public.</li>
              <li>
                Corrections you choose to submit: the target, category, proposed correction, evidence link, explanation, optional public attribution, moderation state and the public resolution.
              </li>
              <li>
                An optional private contact on a correction, encrypted with AES-256-GCM, never shown and never returned by the API or the MCP server. It is deleted {CONTACT_RETENTION_DAYS} days after submission at the latest.
              </li>
              <li>A keyed hash (HMAC-SHA-256) of the submitting network address, kept with each correction to limit submissions to five per hour. The address itself is not stored.</li>
              <li>Server error logs with a fixed event name and error type only. Request addresses, query strings and request bodies are not logged.</li>
            </ul>
          </div>
          <div>
            <h3 className="eyebrow mb-2">Never stored</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>Votes, ballots, wallet addresses or signatures. The site never connects a wallet.</li>
              <li>Search text typed into Research or the command palette. It is used to answer the request and discarded.</li>
              <li>AI Lab prompts and generated briefs. They are built in your browser, and no AI output is cached on the server for any user.</li>
              <li>Workspace contents, names you type and what-if scenarios.</li>
              <li>Analytics, tracking cookies or third-party requests. Fonts are served from this site, and the browser contacts no other origin. Only the server contacts TheDAO Security Fund&apos;s public API and the documented research sources, such as GitHub.</li>
            </ul>
          </div>
        </div>
      </Block>
    </div>
  );
}
