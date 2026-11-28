import type { Metadata } from "next";
import { ArrowRight } from "@/components/ui/icons";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ClaimList, CorrectionButton, InspectorProvider } from "@/components/dossier/inspector";
import { evidenceGroupTitle } from "@/lib/dossier/labels";
import { ProposalHistory } from "@/components/dossier/history";
import { MilestoneXRay } from "@/components/dossier/milestones";
import { RealityVsPromises } from "@/components/dossier/reality";
import { EvidenceCard } from "@/components/dossier/evidence-card";
import { BriefingView } from "@/components/dossier/briefing";
import { Round1History } from "@/components/dossier/round1";
import { SimilarInitiatives } from "@/components/dossier/similar";
import { OpenQuestions } from "@/components/dossier/open-questions";
import { ExternalLink, Tag } from "@/components/ui/button";
import { TheDaoStatus } from "@/components/ui/thedao-status";
import { TeamResearchSection } from "@/components/dossier/team-research";
import { loadTeamResearch } from "@/lib/team/load";
import { Note } from "@/components/ui/layout";
import { ApplicantQuote } from "@/components/ui/markdown";
import { DateTime, NotAvailable, Pct, formatDate } from "@/components/ui/money";
import { Section, Sections } from "@/components/ui/sections";
import { StatusLegend, StatusMark } from "@/components/ui/status";
import { ReviewedButton } from "@/components/workspace/review-button";
import { visitFeed } from "@/lib/workspace/feed";
import { DossierAffiliationTag, SharedGroupLine } from "@/components/workspace/affiliations";
import { SaveButton } from "@/components/workspace/save-button";
import { CATEGORY_LABEL, CORRECTION_NOTICE } from "@/lib/corrections";
import { BANNER_HREF, COI_SHORT, isCoiOrganization } from "@/lib/disclosure";
import type { Claim, Evidence } from "@/lib/domain/schemas";
import { unsupportedMaterialClaims } from "@/lib/intelligence/unsupported-material";
import { loadIntelligence } from "@/lib/intelligence/load";
import { BLIND_SPOT_LABEL, COVERAGE_TASK_LABEL, dependencies, dossier, briefingFor, evidenceCard, OPEN_QUESTION_NOTICE, openQuestionsFor, PRESENT_SUPPORTED, plainExplanation, questionsAsText, researchCoverage, round1History, sharedGroupsOf, similarFor } from "@/lib/intelligence/service";
import { AiSlot, CounterBody, SupportingBody } from "@/components/dossier/research-slots";
import { NotYetResearched } from "@/components/ui/ai-interpretation";
import { CORE_RESEARCH_TASKS } from "@/lib/intelligence/status";
import { affiliationTargets, GROUPS_OFF_NOTE } from "@/lib/vote/affiliation";

export const revalidate = 600;
export const dynamicParams = true;

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const { dataset } = await loadIntelligence();
  return dataset.initiatives.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { dataset } = await loadIntelligence();
  const ini = dataset.initiatives.find((i) => i.slug === slug);
  return ini ? { title: ini.shortTitle, description: plainExplanation(ini) } : { title: "Initiative not found" };
}

const TASK_LABEL: Record<string, string> = { websites: "Websites", github: "GitHub", milestone_artifacts: "Milestone artifacts", donations_onchain: "Onchain donations", links: "Links", claims: "Claims", curated: "Curated" };

function Sub({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h3 className="eyebrow mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,200px)_1fr] gap-x-6 border-t border-rule text-sm max-sm:grid-cols-1">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="border-b border-rule py-1.5 text-ink-3 max-sm:border-0 max-sm:pb-0">{k}</dt>
          <dd className="border-b border-rule py-1.5 max-sm:pt-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}


export default async function InitiativePage({ params }: Params) {
  const { slug } = await params;
  const { dataset: d } = await loadIntelligence();
  const x = dossier(d, slug);
  if (!x) notFound();
  const ini = x.initiative;
  const f = ini.funding;
  const m = x.metrics;
  const mv = (id: string) => m[id]?.value ?? null;
  const mr = (id: string) => m[id]?.unavailableReason ?? undefined;
  const sec = (key: string) => ini.sections.find((s) => s.key === key);
  const sectionLabels: Record<string, string> = {
    ...Object.fromEntries(ini.sections.map((s) => [s.key, `Proposal section: ${s.heading}`])),
    ...Object.fromEntries(x.milestones.map((ms) => [`milestone:${ms.index}`, `Milestone ${ms.index + 1}: ${ms.name}`])),
    funding: "Official funding record",
  };
  const headings = Object.fromEntries(ini.sections.map((s) => [s.key, s.heading]));
  const byKind = (...k: Claim["kind"][]) => x.claims.filter((c) => k.includes(c.kind));
  const supported = x.claims.filter((c) => PRESENT_SUPPORTED.includes(c.status));
  const unsupportedMaterial = unsupportedMaterialClaims(x.claims);
  const jobs = CORE_RESEARCH_TASKS.map((t) => ({ task: t, job: x.researchJobs.find((j) => j.task === t) }));
  const jobsOk = jobs.filter((j) => j.job?.state === "succeeded").length;
  const lastJob = x.researchJobs.map((j) => j.finishedAt).filter((v): v is string => !!v).sort().pop() ?? null;
  const deps = dependencies(d, ini.id)[0];
  const round1 = round1History(d, ini.id)!;
  const card = evidenceCard(d, ini.id)!;
  const briefing = briefingFor(d, ini.id)!;
  const similar = similarFor(d, ini.id) ?? [];
  const openQs = openQuestionsFor(d, ini.id) ?? [];
  // Questions from the older evidence rules that the open-question rules already cover are not repeated.
  const coveredRefs = new Set(openQs.filter((q) => q.ruleId === "adoption_named_party" || q.ruleId === "existing_claim_without_link").map((q) => q.ref));
  const otherSpots = x.blindSpots.filter((b) => !((b.category === "adoption_dependency" || b.category === "unconfirmed_integration") && b.refs.some((r) => coveredRefs.has(r))));
  const otherMilestoneQs = x.milestones.flatMap((ms) => ms.questions.filter((q) => q.code !== "no_target_month" && !(q.code === "adoption_dependency" && coveredRefs.has(ms.id))).map((q) => ({ ms, q })));
  const higher = x.blindSpots.filter((b) => b.importance === "higher");
  const coverage = researchCoverage(d, ini.id)!;
  // The site runs no AI model; an AI slot shows "Not yet researched" unless an AI result is published.
  const aiClaims = x.claims.filter((c) => c.origin === "ai");
  const aiSlot = (what: string) => <AiSlot what={what} coverage={coverage} aiClaims={aiClaims} />;
  const recipient = x.organization?.name ?? ini.recipientTeam;
  const quote = (key: string) => {
    const s = sec(key);
    return s ? <ApplicantQuote key={key} heading={s.heading} source={s.markdown} revision={ini.revision} href={`${ini.url}#${key}`} /> : null;
  };
  const evidenceByKind = new Map<Evidence["kind"], Evidence[]>();
  for (const e of x.evidence) evidenceByKind.set(e.kind, [...(evidenceByKind.get(e.kind) ?? []), e]);
  const corrections = x.claims.flatMap((c) => c.history.filter((h) => h.correctionId).map((h) => ({ claim: c, h })));
  const sectionIds = [
    "briefing",
    "problem",
    "exists",
    "requires",
    "team",
    "code",
    "financial",
    "round1",
    "milestones",
    "technical",
    "adoption",
    "dependencies",
    "similar",
    "supporting",
    "counter",
    "questions",
    "sources",
    "corrections",
    "history",
  ];

  return (
    <InspectorProvider
      claims={x.claims}
      evidence={x.evidence}
      sections={sectionLabels}
      correction={{ notice: CORRECTION_NOTICE, categories: Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label })) }}
    >
      <article>
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-ink-3">
          <Link href="/initiatives" className="hover:text-accent">
            Initiatives
          </Link>
          <span className="mx-1.5">/</span>
          <span>{ini.shortTitle}</span>
        </nav>

        {isCoiOrganization(ini.organizationId) && (
          <aside className="mb-6 border-l-2 border-ink bg-paper-2 px-4 py-3 text-sm" aria-label="Conflict of interest">
            <p className="font-semibold">Conflict of interest</p>
            <p className="mt-1 text-ink-2">
              {COI_SHORT} This dossier is produced by the same pipeline and rules as every other initiative, with no ranking or score.{" "}
              <Link href={BANNER_HREF} className="link">
                Read the disclosure
              </Link>
              .
            </p>
          </aside>
        )}

        <header>
          <div className="min-w-0">
            <div className="eyebrow mb-2 flex flex-wrap gap-x-2">
              <span>{ini.type === "rfp" ? "Request for proposals" : "Grant"}</span>
              <span aria-hidden="true">·</span>
              <span>{ini.onBallot ? "On ballot" : "Not on ballot"}</span>
            </div>
            <h1 className="text-[30px] leading-[36px] font-semibold tracking-[-0.018em] max-sm:text-[24px] max-sm:leading-[30px]">{ini.title}</h1>
            <p className="mt-2 text-sm text-ink-2">
              {recipient ? (
                x.organization ? (
                  <Link href={`/entities/organization/${encodeURIComponent(x.organization.id)}`} className="font-medium text-ink hover:text-accent">
                    {recipient}
                  </Link>
                ) : (
                  <span className="font-medium text-ink">{recipient}</span>
                )
              ) : (
                <span>No designated recipient (open request for proposals)</span>
              )}
              {ini.durationMonths && <span> · {ini.durationMonths} months</span>}
              {ini.approvedAt && <span> · Approved {formatDate(ini.approvedAt)}</span>}
            </p>
            {d.vote.groupsAvailable ? <SharedGroupLine groups={sharedGroupsOf(d, ini.id)} className="mt-1" /> : <p className="mt-1 text-xs text-ink-3">{GROUPS_OFF_NOTE}</p>}
            <DossierAffiliationTag id={ini.id} targets={affiliationTargets(d).filter((t) => t.initiativeId === ini.id)} />
            <div className="mt-5 max-w-[720px] border-l-2 border-ink pl-4">
              <p className="text-[18px] leading-[27px] text-ink max-sm:text-[16px] max-sm:leading-6">{plainExplanation(ini)}</p>
              <p className="mt-1 text-2xs text-ink-3">Opening sentence of the official summary, quoted verbatim.</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {ini.categories.map((c) => (
                <Link key={c.slug} href={`/initiatives?cat=${c.slug}`}>
                  <Tag className="hover:border-ink-3">{c.label}</Tag>
                </Link>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              <ExternalLink href={ini.url}>Official initiative page</ExternalLink>
              <SaveButton id={ini.id} title={ini.shortTitle} />
              <ReviewedButton id={ini.id} title={ini.shortTitle} entry={visitFeed(d).find((e) => e.id === ini.id)} />
              <CorrectionButton type="initiative" id={ini.id} label={ini.title} />
            </div>
            <nav aria-label="Research this initiative" className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-rule pt-3 text-xs text-ink-3">
              <span className="eyebrow">Explore</span>
              <Link href={`/teams?type=initiative&id=${encodeURIComponent(ini.id)}`} className="hover:text-accent">
                Relationship map
              </Link>
              {similar.length > 0 && (
                <Link href={`/initiatives?ids=${[ini.slug, ...similar.map((r) => r.other.slug)].slice(0, 5).join(",")}#compare`} className="hover:text-accent">
                  Compare with similar ({Math.min(similar.length, 4)})
                </Link>
              )}
              <Link href={`/initiatives?ini=${ini.slug}#milestones`} className="hover:text-accent">
                Milestones across the cohort
              </Link>
              <Link href={`/initiatives?ini=${ini.slug}#questions`} className="hover:text-accent">
                Blind spots ({x.blindSpots.length})
              </Link>
              <Link href={`/initiatives?ini=${ini.slug}#changes`} className="hover:text-accent">
                Changes ({x.changes.length})
              </Link>
              <Link href={`/workspace?ids=${ini.slug}#what-if`} className="hover:text-accent">
                What-if
              </Link>
            </nav>
          </div>

        </header>

        <TeamResearchSection research={loadTeamResearch(ini.id)} />

        <section aria-label="Research status" className="mt-8 max-w-[560px]">
          <p className="eyebrow mb-1">Research status</p>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-xs">
              <dt className="text-ink-3">Evidence coverage</dt>
              <dd className="text-right">
                <Pct value={mv("initiative.evidence_coverage")} digits={0} reason={mr("initiative.evidence_coverage")} />
              </dd>
              <dt className="text-ink-3">Claims with supporting evidence</dt>
              <dd className="num text-right">
                {supported.length} of {x.claims.length}
              </dd>
              <dt className="text-ink-3">Open questions</dt>
              <dd className="num text-right">
                <a href="#questions" className="hover:text-accent">
                  {openQs.length}
                </a>
              </dd>
              <dt className="text-ink-3">Research freshness</dt>
              <dd className="text-right">{lastJob ? <DateTime iso={lastJob} /> : <NotAvailable reason="No research job has run" />}</dd>
              <dt className="text-ink-3">Automated checks</dt>
              <dd className="num text-right">
                {jobsOk} of {CORE_RESEARCH_TASKS.length} succeeded
              </dd>
            </dl>
        </section>

          <div className="mt-10 max-w-[640px] border-t border-ink pt-3" data-official-figures>
            <TheDaoStatus href={ini.url} />
          </div>

        <EvidenceCard card={card} />

        <BriefingView briefing={briefing} chainHref="/workspace/briefing" />

        <div className="mt-10">
          <RealityVsPromises x={x} />
          <StatusLegend className="mt-3" />
        </div>

        <div className="mt-10">
          <Sections ids={sectionIds} defaultOpen={["briefing", "milestones"]}>
            <Section id="briefing" n={1} title="Executive briefing" meta="Computed from the official record and the research pipeline">
              <ul className="max-w-[820px] list-[square] space-y-1.5 pl-4 text-base text-ink-2 marker:text-ink-3">
                <li>
                  A {ini.type === "rfp" ? "request for proposals" : "grant"}
                  {ini.durationMonths ? ` over ${ini.durationMonths} months` : ""}, across {x.milestones.length} {x.milestones.length === 1 ? "milestone" : "milestones"}. Funding and voting status are on TheDAO.
                </li>
                <li>
                  {supported.length} of {x.claims.length} extracted statements have independent or partial supporting evidence. {unsupportedMaterial.length} material {unsupportedMaterial.length === 1 ? "statement is" : "statements are"} the applicant&apos;s own, without independent support.
                </li>
                <li>
                  {x.milestones.filter((ms) => ms.done).length} of {x.milestones.length} milestones are marked complete in the official record.
                </li>
              </ul>
              {higher.length > 0 && (
                <Sub title="Key uncertainties" className="mt-5 max-w-[820px]">
                  <ul className="space-y-2">
                    {higher.slice(0, 4).map((b) => (
                      <li key={b.id} className="border-l-2 border-st-partial pl-3 text-sm">
                        <span className="text-2xs text-ink-3 uppercase">{BLIND_SPOT_LABEL[b.category]}</span>
                        <p className="text-ink">{b.question}</p>
                      </li>
                    ))}
                  </ul>
                  {higher.length > 4 && (
                    <a href="#questions" className="mt-2 inline-block text-xs text-ink-3 hover:text-accent">
                      {higher.length - 4} more under Open questions <ArrowRight />
                    </a>
                  )}
                </Sub>
              )}
              <Note className="mt-4">No score, ranking or voting advice is produced.</Note>
            </Section>

            <Section id="problem" n={2} title="Problem and proposed solution" meta="Official summary and applicant text">
              <div className="max-w-[820px] space-y-5">
                <Sub title="Official summary">
                  <p className="text-base text-ink">{ini.summary}</p>
                </Sub>
                {quote("why")}
                {quote("in_scope")}
              </div>
            </Section>

            <Section id="exists" n={3} title="What exists today" meta={`${x.reality.existing.length} with proof · ${x.reality.statedExisting.length} stated by the applicant`}>
              <div className="max-w-[880px] space-y-5">
                <Sub title="Existing work with machine-observed evidence">
                  <ClaimList ids={byKind("existing_artifact", "milestone_completed").map((c) => c.id)} empty="No cited repositories or completed milestones were found." />
                </Sub>
                {x.reality.statedExisting.length > 0 && (
                  <Sub title="Stated by the applicant">
                    <ClaimList ids={x.reality.statedExisting.map((c) => c.id)} empty="" showQuote />
                  </Sub>
                )}
                {quote("why_grant")}
                {quote("existing")}
              </div>
            </Section>

            <Section id="requires" n={4} title="What the proposal says it will build" meta={`${x.milestones.length} milestones`}>
              <div className="max-w-[880px] space-y-5">
                <Sub title="Planned deliverables (official milestones)">
                  <ClaimList ids={byKind("milestone_deliverable").map((c) => c.id)} empty="No planned delivery milestones are recorded." />
                </Sub>
                {quote("hard_req")}
                {quote("out_scope")}
              </div>
            </Section>

            <Section id="team" n={5} title="Team and organization" meta={recipient ?? "No designated recipient"}>
              <div className="max-w-[880px] space-y-5">
                {x.organization ? (
                  <Facts
                    rows={[
                      ["Organization", x.organization.name],
                      ["Also recorded as", x.organization.names.filter((n) => n !== x.organization?.name).join(", ") || "No other spellings"],
                      [
                        "Website",
                        x.organization.websiteCheck ? (
                          <span>
                            <ExternalLink href={x.organization.websiteCheck.url}>{x.organization.websiteCheck.url}</ExternalLink>{" "}
                            <span className="text-xs text-ink-3">
                              {x.organization.websiteCheck.ok ? "reachable" : "not reachable"}, HTTP {x.organization.websiteCheck.status ?? "no response"}, checked {formatDate(x.organization.websiteCheck.checkedAt)}
                            </span>
                          </span>
                        ) : (
                          (x.organization.website ?? "Not recorded")
                        ),
                      ],
                      ["Website description", x.organization.description ? <span className="text-ink-2">“{x.organization.description}” <span className="text-xs text-ink-3">(from the website&apos;s own description tag)</span></span> : "Not available"],
                      [
                        "GitHub",
                        x.organization.githubProfile ? (
                          <span>
                            <ExternalLink href={x.organization.githubProfile.url}>{x.organization.githubProfile.login}</ExternalLink>{" "}
                            <span className="text-xs text-ink-3">
                              {x.organization.githubProfile.type}, {x.organization.githubProfile.publicRepos ?? "unknown number of"} public repositories
                              {x.organization.githubProfile.createdAt ? `, created ${formatDate(x.organization.githubProfile.createdAt)}` : ""}
                            </span>
                          </span>
                        ) : (
                          "No GitHub organization linked"
                        ),
                      ],
                      ["Other initiatives proposed", String(x.organization.initiativeIds.filter((id) => id !== ini.id).length)],
                    ]}
                  />
                ) : (
                  <p className="text-sm text-ink-3">This is an open request for proposals; no recipient organization is designated yet.</p>
                )}
                {x.aliases.length > 0 && (
                  <Sub title="Name resolution">
                    <ul className="space-y-1 text-sm">
                      {x.aliases.map((a) => (
                        <li key={a.id}>
                          “{a.alias}” <span className="text-xs text-ink-3">· {a.resolution === "candidate_unconfirmed" ? "possible match, not confirmed as the same entity" : a.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </Sub>
                )}
                <Sub title="People named in the proposal">
                  {x.people.length ? (
                    <ul className="divide-y divide-rule border-y border-rule text-sm">
                      {x.people.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                          <span className="font-medium">{p.name}</span>
                          {p.role && <span className="text-xs text-ink-3">{p.role}</span>}
                          {p.publicProfiles.map((u) => (
                            <ExternalLink key={u} href={u} className="text-xs">
                              {new URL(u).hostname.replace(/^www\./, "")}
                            </ExternalLink>
                          ))}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-3">No people with linked public profiles were found in the proposal.</p>
                  )}
                  <Note className="mt-1.5">Profiles are linked by the applicant. We did not verify that a profile belongs to the named person.</Note>
                </Sub>
                {byKind("team").length > 0 && (
                  <Sub title="Team statements">
                    <ClaimList ids={byKind("team").map((c) => c.id)} empty="" />
                  </Sub>
                )}
                {quote("team")}
                {quote("who")}
              </div>
            </Section>

            <Section id="code" n={6} title="Code and product evidence" meta={`${x.repositories.filter((r) => r.exists).length} public repositories · ${x.products.filter((p) => p.reachable).length} reachable pages`}>
              <div className="space-y-5">
                {!coverage.succeededTasks.includes("github") && <NotYetResearched missing={[COVERAGE_TASK_LABEL.github]}>Repository facts appear after the GitHub checks have run.</NotYetResearched>}
                {x.repositories.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <caption className="sr-only">Repositories cited in the proposal and what the GitHub API reports for each.</caption>
                      <thead>
                        <tr className="border-b border-ink text-left text-2xs tracking-wide text-ink-3 uppercase">
                          {["Repository", "Public", "License", "Last push", "Commits, 90 days", "CI", "Tests folder", "Security policy", "Latest release"].map((h) => (
                            <th key={h} scope="col" className="px-2 py-2 font-medium first:pl-0">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {x.repositories.map((r) => {
                          const yn = (v: boolean | null) => (v === null ? <span className="text-ink-3">Unknown</span> : v ? "Yes" : "No");
                          return (
                            <tr key={r.id} className="border-b border-rule align-top">
                              <td className="py-1.5 pr-2">
                                <ExternalLink href={r.url}>{r.fullName}</ExternalLink>
                                {r.description && <span className="block max-w-[320px] truncate text-xs text-ink-3">{r.description}</span>}
                              </td>
                              <td className="px-2 py-1.5">{r.exists ? (r.archived ? "Yes, archived" : "Yes") : "Not found"}</td>
                              <td className="px-2 py-1.5">{r.license ?? <span className="text-ink-3">None</span>}</td>
                              <td className="num px-2 py-1.5">{r.pushedAt ? formatDate(r.pushedAt) : "–"}</td>
                              <td className="num px-2 py-1.5 text-right">{r.commitsLast90d ?? "–"}</td>
                              <td className="px-2 py-1.5">{yn(r.hasCiWorkflows)}</td>
                              <td className="px-2 py-1.5">{yn(r.hasTestsDir)}</td>
                              <td className="px-2 py-1.5">{yn(r.hasSecurityPolicy)}</td>
                              <td className="px-2 py-1.5">{r.latestRelease ? `${r.latestRelease.tag}${r.latestRelease.publishedAt ? `, ${formatDate(r.latestRelease.publishedAt)}` : ""}` : <span className="text-ink-3">None</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <Note className="mt-2">From the GitHub API at research time. Activity and repository hygiene describe what exists publicly; they do not measure security quality.</Note>
                  </div>
                ) : (
                  <p className="text-sm text-ink-3">The proposal cites no GitHub repositories.</p>
                )}
                {x.products.length > 0 && (
                  <Sub title="Product and documentation pages">
                    <ul className="divide-y divide-rule border-y border-rule text-sm">
                      {x.products.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-1.5">
                          <ExternalLink href={p.url}>{p.title ?? p.name}</ExternalLink>
                          <span className="text-xs text-ink-3">
                            {p.reachable === null ? "Not checked" : p.reachable ? "Reachable" : "Not reachable"}
                            {p.status ? `, HTTP ${p.status}` : ""}
                            {p.checkedAt ? `, ${formatDate(p.checkedAt)}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Sub>
                )}
              </div>
            </Section>

            <Section id="financial" n={7} title="Funding and voting" meta="Published by TheDAO, not copied here">
              <TheDaoStatus href={ini.url} />
              {byKind("previous_funding").length > 0 && (
                <Sub title="Previous funding mentioned in the proposal" className="mt-6 max-w-[880px]">
                  <ClaimList ids={byKind("previous_funding").map((c) => c.id)} empty="" />
                </Sub>
              )}
            </Section>

            <Section id="round1" n={8} title="Round 1 history" meta={round1.records.length ? `${round1.records.length} Round 1 ${round1.records.length === 1 ? "record" : "records"}` : "None found"}>
              <Round1History view={round1} subject={{ label: "Official proposal", href: ini.url }} />
            </Section>

            <Section id="milestones" n={9} title="Milestone X-Ray" meta={`${x.milestones.length} milestones · ${x.milestones.reduce((s, ms) => s + ms.questions.length, 0)} questions`}>
              <MilestoneXRay milestones={x.milestones} claims={x.claims} goalCents={f.goalCents} />
            </Section>

            <Section id="technical" n={10} title="Technical assessment" meta="Rule-based classification and repository facts">
              <div className="max-w-[880px] space-y-5">
                <Sub title="Security lifecycle stages (rule-based)">
                  <ul className="divide-y divide-rule border-y border-rule text-sm">
                    {ini.stages.map((s) => (
                      <li key={s.stage} className="grid grid-cols-[200px_1fr] gap-4 py-1.5 max-sm:grid-cols-1 max-sm:gap-0">
                        <Link href={`/initiatives?stage=${s.stage}`} className="font-medium hover:text-accent">
                          {d.securityProblems.find((p) => p.id === s.stage)?.label ?? s.stage}
                          {s.primary && <span className="ml-2 text-2xs font-normal text-ink-3">primary</span>}
                        </Link>
                        <span className="text-xs text-ink-2">Matched terms: {s.matchedTerms.join(", ") || "official category hint"}</span>
                      </li>
                    ))}
                  </ul>
                  <Note className="mt-1.5">A stage is assigned when the proposal text contains one of its listed terms. Read it as a prompt for investigation, not a finding.</Note>
                </Sub>
                {!coverage.succeededTasks.includes("github") && <NotYetResearched missing={[COVERAGE_TASK_LABEL.github]}>Repository counts below are not yet researched.</NotYetResearched>}
                <Facts
                  rows={[
                    ["Standards referenced", ini.standards.join(", ") || "None found"],
                    ["Public repositories cited", String(mv("initiative.repos_public") ?? 0)],
                    ["With commits in 90 days", String(mv("initiative.repos_active_90d") ?? 0)],
                    ["With CI workflows", String(mv("initiative.repos_with_ci") ?? 0)],
                    ["Languages", [...new Set(x.repositories.map((r) => r.language).filter(Boolean))].join(", ") || "Not available"],
                  ]}
                />
              </div>
            </Section>

            <Section id="adoption" n={11} title="Adoption commitments" meta="Milestones paid only when third parties adopt the work">
              <div className="max-w-[880px] space-y-5">
                <ClaimList ids={byKind("adoption_commitment").map((c) => c.id)} empty="No adoption milestones are recorded. Payment does not depend on third-party uptake." />
                {quote("commitments")}
              </div>
            </Section>

            <Section id="dependencies" n={12} title="Dependencies" meta={`${x.reality.dependencies.length} identified`}>
              <div className="max-w-[880px] space-y-5">
                <Facts
                  rows={[
                    ["Standards", deps?.standards.length ? deps.standards.map((s) => `${s.standard} (${s.relation === "depends_on" ? "depends on" : "references"})`).join(", ") : "None found"],
                    [
                      "External repositories",
                      deps?.externalRepositories.length ? (
                        <ul key="er" className="space-y-0.5">
                          {deps.externalRepositories.map((r) => (
                            <li key={r.url}>
                              <ExternalLink href={r.url}>{r.fullName}</ExternalLink> <span className="text-xs text-ink-3">{r.maintainedByRecipient ? "maintained by the recipient" : "not maintained by the recipient"}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        "None found"
                      ),
                    ],
                    ["Adoption milestones", deps?.adoptionMilestones.length ? deps.adoptionMilestones.map((a) => a.name).join("; ") : "None"],
                  ]}
                />
                {x.integrations.length > 0 && (
                  <Sub title="Integration statements in the proposal">
                    <ul className="divide-y divide-rule border-y border-rule text-sm">
                      {x.integrations.map((it) => (
                        <li key={it.id} className="flex items-start gap-3 py-2">
                          <span className="w-[118px] shrink-0">
                            <StatusMark status={it.status} />
                          </span>
                          <span className="min-w-0">
                            “{it.statement}”
                            <span className="block text-xs text-ink-3">
                              {it.kind === "existing" ? "Described as existing" : it.kind === "planned" ? "Planned" : "Adoption target"} · counterparty: {it.counterparty}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Sub>
                )}
              </div>
            </Section>

            <Section id="similar" n={13} title="Similar initiatives" meta={`${similar.length} ${similar.length === 1 ? "pair" : "pairs"} · research hypotheses`}>
              <SimilarInitiatives items={similar} self={{ name: ini.title }} />
              <Note className="mt-4">
                Separate collaboration hypotheses from text similarity and shared lifecycle stages ({x.related.length}) are listed on the{" "}
                <Link href={`/initiatives#compare`} className="link">
                  compare section on Initiatives
                </Link>
                .
              </Note>
            </Section>

            <Section id="supporting" n={14} title="Strongest supporting arguments" meta={`${supported.length} statements with supporting evidence`}>
              <div className="max-w-[880px] space-y-3">
                {aiSlot("statements")}
                <Note>Statements in the record that have independent or partial supporting evidence. Listed, not weighed.</Note>
                <SupportingBody coverage={coverage} list={<ClaimList ids={supported.filter((c) => c.origin !== "ai").map((c) => c.id)} empty="No statement has independent supporting evidence among the checks completed so far." />} />
              </div>
            </Section>

            <Section id="counter" n={15} title="Strongest counterarguments" meta={`${higher.length} higher-importance gaps`}>
              <div className="max-w-[880px] space-y-3">
                {aiSlot("questions")}
                <Note>Gaps a skeptical reviewer would raise, derived from the evidence record by fixed rules. Phrased as questions, not accusations. Missing data is a reason to ask, never a finding.</Note>
                <CounterBody d={d} higher={higher} coverage={coverage} />
                {unsupportedMaterial.length > 0 && (
                  <Sub title={`Material statements without independent support (${unsupportedMaterial.length})`}>
                    <ClaimList ids={unsupportedMaterial.map((c) => c.id)} empty="" />
                  </Sub>
                )}
              </div>
            </Section>

            <Section id="questions" n={16} title="Open questions" meta={`${openQs.length} rule-based ${openQs.length === 1 ? "question" : "questions"} · ${otherSpots.length + otherMilestoneQs.length} from the evidence rules`}>
              <div className="space-y-6">
                <OpenQuestions items={openQs} notice={OPEN_QUESTION_NOTICE} copyText={questionsAsText(ini.title, openQs)} quoteSource="TheDAO API milestone record" />
                <Sub title="Other questions from the evidence rules" className="max-w-[880px]">
                  <Note className="mb-2">Raised by the blind-spot and milestone rules. Questions the open-question rules above already ask are not repeated.</Note>
                  {otherSpots.length > 0 && (
                    <ul className="divide-y divide-rule border-y border-rule">
                      {[...otherSpots.filter((b) => b.importance === "higher"), ...otherSpots.filter((b) => b.importance === "standard")].map((b) => (
                        <li key={b.id} className="grid grid-cols-[180px_1fr] gap-4 py-2 text-sm max-sm:grid-cols-1 max-sm:gap-0.5">
                          <span className="text-xs text-ink-3">
                            {BLIND_SPOT_LABEL[b.category]}
                            {b.importance === "higher" && <span className="block text-st-partial">Higher importance</span>}
                          </span>
                          <span>{b.question}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {otherMilestoneQs.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-sm">
                      {otherMilestoneQs.map(({ ms, q }) => (
                        <li key={`${ms.id}-${q.code}`}>
                          <span className="num mr-2 text-xs text-ink-3">M{ms.index + 1}</span>
                          {q.question}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    otherSpots.length === 0 && <p className="text-sm text-ink-3">The evidence rules raised no further questions.</p>
                  )}
                </Sub>
              </div>
            </Section>

            <Section id="sources" n={17} title="Evidence sources" meta={`${x.evidence.length} records`}>
              <div className="space-y-5">
                {[...evidenceByKind.entries()].map(([kind, list]) => (
                  <Sub key={kind} title={evidenceGroupTitle(kind, list.length)}>
                    <ul className="divide-y divide-rule border-y border-rule text-sm">
                      {list.map((e) => (
                        <li key={e.id} className="grid grid-cols-[1fr_auto] gap-4 py-1.5 max-sm:grid-cols-1 max-sm:gap-0">
                          <span className="min-w-0">
                            <ExternalLink href={e.url} className="break-all">
                              {e.title}
                            </ExternalLink>
                          </span>
                          <span className="text-xs whitespace-nowrap text-ink-3">
                            {e.ok ? "Succeeded" : "Did not succeed"} · {formatDate(e.observedAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Sub>
                ))}
                <Note>
                  Official record: <ExternalLink href={ini.url}>{ini.url}</ExternalLink>
                </Note>
              </div>
            </Section>

            <Section id="corrections" n={18} title="Corrections" meta={corrections.length ? `${corrections.length} applied` : "None applied"}>
              <div className="max-w-[820px] space-y-4">
                <p className="text-sm text-ink-2">{CORRECTION_NOTICE}</p>
                <div className="flex flex-wrap items-center gap-4">
                  <CorrectionButton type="initiative" id={ini.id} label={ini.title} className="rounded-sm border border-rule-2 px-2.5 py-1 text-ink-2 no-underline hover:border-ink-3">
                    Suggest a correction to this dossier
                  </CorrectionButton>
                  <Link href="/about#corrections" className="text-xs text-ink-3 hover:text-accent">
                    Public corrections log <ArrowRight />
                  </Link>
                </div>
                {corrections.length > 0 ? (
                  <ul className="divide-y divide-rule border-y border-rule text-sm">
                    {corrections.map(({ claim, h }) => (
                      <li key={`${claim.id}-${h.at}`} className="py-2">
                        <span className="num text-xs text-ink-3">{formatDate(h.at)}</span> {h.reason}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Note>No accepted correction has changed this dossier.</Note>
                )}
                <Note>Every statement in the source inspector also has its own correction link.</Note>
              </div>
            </Section>

            <Section id="history" n={19} title="Proposal history" meta={`${x.revisions.length} official revisions`}>
              <ProposalHistory revisions={x.revisions} sectionHeadings={headings} />
            </Section>
          </Sections>
        </div>

        <p className="mt-6 text-2xs text-ink-3">
          Research checks:{" "}
          {jobs.map((j, i) => (
            <span key={j.task}>
              {i > 0 && " · "}
              {TASK_LABEL[j.task] ?? j.task}: {j.job ? j.job.state : "not run"}
            </span>
          ))}
        </p>
      </article>
    </InspectorProvider>
  );
}
