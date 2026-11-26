import type { Metadata } from "next";
import { ArrowRight } from "@/components/ui/icons";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ClaimList, CorrectionButton, EVIDENCE_KIND_LABEL, InspectorProvider } from "@/components/dossier/inspector";
import { ProposalHistory } from "@/components/dossier/history";
import { MilestoneXRay } from "@/components/dossier/milestones";
import { RealityVsPromises } from "@/components/dossier/reality";
import { COI_SHORT } from "@/components/shell/footer";
import { ExternalLink, Tag } from "@/components/ui/button";
import { FundingBar, FundingLegend } from "@/components/ui/charts";
import { Note } from "@/components/ui/layout";
import { ApplicantQuote } from "@/components/ui/markdown";
import { DateTime, Money, NotAvailable, Pct, formatDate } from "@/components/ui/money";
import { Section, Sections } from "@/components/ui/sections";
import { StatusLegend, StatusMark } from "@/components/ui/status";
import { ReviewedButton } from "@/components/workspace/review-button";
import { SaveButton } from "@/components/workspace/save-button";
import { CATEGORY_LABEL, CORRECTION_NOTICE } from "@/lib/corrections";
import type { Claim, Evidence } from "@/lib/domain/schemas";
import { loadIntelligence } from "@/lib/intelligence/load";
import { BLIND_SPOT_LABEL, dependencies, dossier, PRESENT_SUPPORTED, plainExplanation, type Dossier } from "@/lib/intelligence/service";
import { CORE_RESEARCH_TASKS } from "@/lib/intelligence/status";
import { formatPct } from "@/lib/util/money";

export const revalidate = 300;
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

const isPoa = (x: Dossier) => x.initiative.organizationId === "org_proof-of-audits";

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
  const unsupportedMaterial = x.claims.filter((c) => c.material && (c.status === "applicant_reported" || c.status === "not_independently_verified"));
  const jobs = CORE_RESEARCH_TASKS.map((t) => ({ task: t, job: x.researchJobs.find((j) => j.task === t) }));
  const jobsOk = jobs.filter((j) => j.job?.state === "succeeded").length;
  const lastJob = x.researchJobs.map((j) => j.finishedAt).filter((v): v is string => !!v).sort().pop() ?? null;
  const deps = dependencies(d, ini.id)[0];
  const higher = x.blindSpots.filter((b) => b.importance === "higher");
  const standard = x.blindSpots.filter((b) => b.importance === "standard");
  const recipient = x.organization?.name ?? ini.recipientTeam;
  const quote = (key: string) => {
    const s = sec(key);
    return s ? <ApplicantQuote key={key} heading={s.heading} source={s.markdown} revision={ini.revision} href={`${ini.url}#${key}`} /> : null;
  };
  const evidenceByKind = new Map<Evidence["kind"], Evidence[]>();
  for (const e of x.evidence) evidenceByKind.set(e.kind, [...(evidenceByKind.get(e.kind) ?? []), e]);
  const corrections = x.claims.flatMap((c) => c.history.filter((h) => h.correctionId).map((h) => ({ claim: c, h })));
  const verifiedDonations = byKind("donation").filter((c) => c.status === "independently_verified");

  const sectionIds = [
    "briefing",
    "problem",
    "exists",
    "requires",
    "team",
    "code",
    "financial",
    "milestones",
    "technical",
    "adoption",
    "dependencies",
    "related",
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
          <Link href="/research" className="hover:text-accent">
            Research
          </Link>
          <span className="mx-1.5">/</span>
          <span>{ini.shortTitle}</span>
        </nav>

        {isPoa(x) && (
          <aside className="mb-6 border-l-2 border-ink bg-paper-2 px-4 py-3 text-sm" aria-label="Conflict of interest">
            <p className="font-semibold">Conflict of interest</p>
            <p className="mt-1 text-ink-2">
              {COI_SHORT} This dossier is produced by the same pipeline and rules as every other initiative, with no ranking or score.{" "}
              <Link href="/about" className="link">
                Read the disclosure
              </Link>
              .
            </p>
          </aside>
        )}

        <header className="grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,1fr)_340px]">
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
            <div className="mt-5 max-w-[720px] border-l-2 border-ink pl-4">
              <p className="text-[18px] leading-[27px] text-ink max-sm:text-[16px] max-sm:leading-6">{plainExplanation(ini)}</p>
              <p className="mt-1 text-2xs text-ink-3">Opening sentence of the official summary, quoted verbatim.</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {ini.categories.map((c) => (
                <Link key={c.slug} href={`/research?cat=${c.slug}`}>
                  <Tag className="hover:border-ink-3">{c.label}</Tag>
                </Link>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              <ExternalLink href={ini.url}>Official initiative page</ExternalLink>
              <SaveButton id={ini.id} title={ini.shortTitle} />
              <ReviewedButton id={ini.id} title={ini.shortTitle} />
              <CorrectionButton type="initiative" id={ini.id} label={ini.title} />
            </div>
            <nav aria-label="Research this initiative" className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-rule pt-3 text-xs text-ink-3">
              <span className="eyebrow">Explore</span>
              <Link href={`/research/graph?type=initiative&id=${encodeURIComponent(ini.id)}`} className="hover:text-accent">
                Relationship map
              </Link>
              {x.related.length > 0 && (
                <Link href={`/research/compare?ids=${[ini.slug, ...x.related.map((r) => r.other?.slug).filter((s): s is string => !!s)].slice(0, 5).join(",")}`} className="hover:text-accent">
                  Compare with related ({Math.min(x.related.length, 4)})
                </Link>
              )}
              <Link href={`/research/milestones?ini=${ini.slug}`} className="hover:text-accent">
                Milestones across the cohort
              </Link>
              <Link href={`/research/blind-spots?ini=${ini.slug}`} className="hover:text-accent">
                Blind spots ({x.blindSpots.length})
              </Link>
              <Link href={`/research/changes?ini=${ini.slug}`} className="hover:text-accent">
                Changes ({x.changes.length})
              </Link>
              <Link href={`/research/what-if?ids=${ini.slug}`} className="hover:text-accent">
                What-if
              </Link>
            </nav>
          </div>

          <aside aria-label="Funding" className="border-t border-ink pt-3 lg:border-t-0 lg:border-l lg:border-rule lg:pt-0 lg:pl-6">
            <p className="eyebrow">Funding</p>
            <p className="mt-1 text-[24px] leading-8 font-medium">
              <Money cents={f.officialRaisedCents} /> <span className="text-sm font-normal text-ink-3">of</span> <Money cents={f.goalCents} className="text-[17px]" />
            </p>
            <p className="text-xs text-ink-3">
              <Pct value={mv("initiative.pct_funded")} reason={mr("initiative.pct_funded")} />
              <span className="ml-1">raised · {mv("initiative.backers") ?? 0} distinct {mv("initiative.backers") === 1 ? "backer" : "backers"}</span>
            </p>
            <FundingBar f={f} height={10} className="mt-3" />
            <FundingLegend f={f} className="mt-2" />
            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-1 border-t border-rule pt-3 text-xs">
              <dt className="text-ink-3">Evidence coverage</dt>
              <dd className="text-right">
                <Pct value={mv("initiative.evidence_coverage")} digits={0} reason={mr("initiative.evidence_coverage")} />
              </dd>
              <dt className="text-ink-3">Claims with supporting evidence</dt>
              <dd className="num text-right">
                {supported.length} of {x.claims.length}
              </dd>
              <dt className="text-ink-3">Open questions</dt>
              <dd className="num text-right">{x.blindSpots.length + x.milestones.reduce((s, ms) => s + ms.questions.length, 0)}</dd>
              <dt className="text-ink-3">Research freshness</dt>
              <dd className="text-right">{lastJob ? <DateTime iso={lastJob} /> : <NotAvailable reason="No research job has run" />}</dd>
              <dt className="text-ink-3">Automated checks</dt>
              <dd className="num text-right">
                {jobsOk} of {CORE_RESEARCH_TASKS.length} succeeded
              </dd>
            </dl>
          </aside>
        </header>

        <div className="mt-10">
          <RealityVsPromises x={x} />
          <StatusLegend className="mt-3" />
        </div>

        <div className="mt-10">
          <Sections ids={sectionIds} defaultOpen={["briefing", "milestones"]}>
            <Section id="briefing" n={1} title="Executive briefing" meta="Computed from the official record and the research pipeline">
              <ul className="max-w-[820px] list-[square] space-y-1.5 pl-4 text-base text-ink-2 marker:text-ink-3">
                <li>
                  Requests <Money cents={f.goalCents} className="text-ink" /> as a {ini.type === "rfp" ? "request for proposals" : "grant"}
                  {ini.durationMonths ? ` over ${ini.durationMonths} months` : ""}, across {x.milestones.length} {x.milestones.length === 1 ? "milestone" : "milestones"}.
                </li>
                <li>
                  Raised <Money cents={f.officialRaisedCents} className="text-ink" /> (<Pct value={mv("initiative.pct_funded")} />
                  ): <Money cents={f.donatedCents} /> received and <Money cents={f.pledgedCents} /> pledged. <Money cents={mv("initiative.remaining")} /> is still needed.
                </li>
                {(mv("initiative.adoption_share") ?? 0) > 0 && (
                  <li>
                    {formatPct(mv("initiative.adoption_share"), 0)} of the goal is in adoption milestones, paid only when third parties adopt the work.
                  </li>
                )}
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
                      {higher.length - 4} more in Unresolved questions <ArrowRight />
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

            <Section id="requires" n={4} title="What requires funding" meta={<Money cents={x.reality.fundingForProposedCents + x.reality.fundingForAdoptionCents} />}>
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

            <Section id="financial" n={7} title="Financial intelligence" meta={`${x.pledges.length} pledge records · ${x.donations.length} donation transactions`}>
              <div className="grid gap-8 xl:grid-cols-2">
                <Facts
                  rows={[
                    ["Goal", <Money key="g" cents={f.goalCents} />],
                    ["Raised (official)", <span key="r"><Money cents={f.officialRaisedCents} /> <span className="text-xs text-ink-3">= pledged + received</span></span>],
                    ["Pledged, not yet received", <Money key="p" cents={f.pledgedCents} />],
                    ["Received onchain", <span key="d"><Money cents={f.donatedCents} /> <span className="text-xs text-ink-3">includes <Money cents={f.receivedCents} /> of pledges marked received</span></span>],
                    ["Still needed", <Money key="n" cents={mv("initiative.remaining")} />],
                    ["Paid out to recipient", <Money key="o" cents={f.paidOutCents} />],
                    ["Safe balance (official ledger)", f.ledgerCents === null ? <NotAvailable key="l" reason="Not reported by the API" /> : <span key="l"><Money cents={f.ledgerCents} /> {f.ledgerCheckedAt && <span className="text-xs text-ink-3">checked {formatDate(f.ledgerCheckedAt)}</span>}</span>],
                    ["Largest backer share", <Pct key="t" value={mv("initiative.top_backer_share")} reason={mr("initiative.top_backer_share")} />],
                    ["Self-pledged by the recipient", <Money key="s" cents={mv("initiative.self_pledged")} reason={mr("initiative.self_pledged")} />],
                    ["Donations verified onchain", verifiedDonations.length ? "Yes, every transaction receipt checked" : x.donations.length ? "Not all transactions verified" : "No donations recorded"],
                  ]}
                />
                <Sub title="Pledges">
                  {x.pledges.length ? (
                    <table className="w-full text-sm">
                      <caption className="sr-only">Pledge records from the official initiative endpoint.</caption>
                      <thead>
                        <tr className="border-b border-ink text-left text-2xs tracking-wide text-ink-3 uppercase">
                          <th scope="col" className="py-1.5 font-medium">
                            Backer
                          </th>
                          <th scope="col" className="py-1.5 text-right font-medium">
                            Amount
                          </th>
                          <th scope="col" className="py-1.5 pl-3 font-medium">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...x.pledges]
                          .sort((a, b) => b.amountCents - a.amountCents || a.company.localeCompare(b.company))
                          .map((p) => (
                            <tr key={p.id} className="border-b border-rule">
                              <td className="py-1.5">
                                {p.company}
                                {p.backerId === ini.organizationId && <span className="ml-2 text-2xs text-ink-3">self-pledge</span>}
                              </td>
                              <td className="py-1.5 text-right">
                                <Money cents={p.amountCents} />
                              </td>
                              <td className="py-1.5 pl-3 text-xs">{p.status === "received" ? "Received" : "Pledged"}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-ink-3">No pledges are recorded.</p>
                  )}
                  <Note className="mt-2">Sorted by amount. Pledge rows are entered by TheDAO Security Fund administrators.</Note>
                </Sub>
              </div>
              {byKind("previous_funding").length > 0 && (
                <Sub title="Previous funding mentioned in the proposal" className="mt-6 max-w-[880px]">
                  <ClaimList ids={byKind("previous_funding").map((c) => c.id)} empty="" />
                </Sub>
              )}
            </Section>

            <Section id="milestones" n={8} title="Milestone X-Ray" meta={`${x.milestones.length} milestones · ${x.milestones.reduce((s, ms) => s + ms.questions.length, 0)} questions`}>
              <MilestoneXRay milestones={x.milestones} claims={x.claims} goalCents={f.goalCents} />
            </Section>

            <Section id="technical" n={9} title="Technical assessment" meta="Rule-based classification and repository facts">
              <div className="max-w-[880px] space-y-5">
                <Sub title="Security lifecycle stages (rule-based)">
                  <ul className="divide-y divide-rule border-y border-rule text-sm">
                    {ini.stages.map((s) => (
                      <li key={s.stage} className="grid grid-cols-[200px_1fr] gap-4 py-1.5 max-sm:grid-cols-1 max-sm:gap-0">
                        <Link href={`/research?stage=${s.stage}`} className="font-medium hover:text-accent">
                          {d.securityProblems.find((p) => p.id === s.stage)?.label ?? s.stage}
                          {s.primary && <span className="ml-2 text-2xs font-normal text-ink-3">primary</span>}
                        </Link>
                        <span className="text-xs text-ink-2">Matched terms: {s.matchedTerms.join(", ") || "official category hint"}</span>
                      </li>
                    ))}
                  </ul>
                  <Note className="mt-1.5">A stage is assigned when the proposal text contains one of its listed terms. Read it as a prompt for investigation, not a finding.</Note>
                </Sub>
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

            <Section id="adoption" n={10} title="Adoption commitments" meta={`${formatPct(mv("initiative.adoption_share"), 0)} of goal in adoption milestones`}>
              <div className="max-w-[880px] space-y-5">
                <ClaimList ids={byKind("adoption_commitment").map((c) => c.id)} empty="No adoption milestones are recorded. Payment does not depend on third-party uptake." />
                {quote("commitments")}
              </div>
            </Section>

            <Section id="dependencies" n={11} title="Dependencies" meta={`${x.reality.dependencies.length} identified`}>
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

            <Section id="related" n={12} title="Related initiatives" meta={`${x.related.length} hypotheses`}>
              {x.related.length ? (
                <ul className="max-w-[880px] divide-y divide-rule border-y border-rule text-sm">
                  {x.related.map(({ relationship: r, other }) => (
                    <li key={r.id} className="py-2">
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        {other ? (
                          <Link href={`/initiatives/${other.slug}`} className="font-medium hover:text-accent">
                            {other.title}
                          </Link>
                        ) : (
                          <span>Unknown initiative</span>
                        )}
                        <span className="text-2xs text-ink-3 uppercase">{r.type === "potentially_overlaps" ? "Possible overlap" : "Possible complement"} · hypothesis</span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-2">{r.reason.replace(/^overlap@\d+:\s*/, "")}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-3">No overlap or complement hypotheses were generated for this initiative.</p>
              )}
              <Note className="mt-2">Hypotheses come from text similarity and shared lifecycle stages. They are not confirmed relationships or partnerships.</Note>
            </Section>

            <Section id="supporting" n={13} title="Strongest supporting arguments" meta={`${supported.length} statements with supporting evidence`}>
              <div className="max-w-[880px] space-y-3">
                <Note>Statements in the record that have independent or partial supporting evidence. Listed, not weighed.</Note>
                <ClaimList ids={supported.map((c) => c.id)} empty="No statement has independent supporting evidence yet." />
              </div>
            </Section>

            <Section id="counter" n={14} title="Strongest counterarguments" meta={`${higher.length} higher-importance gaps`}>
              <div className="max-w-[880px] space-y-3">
                <Note>Gaps a skeptical reviewer would raise, derived from the evidence record by fixed rules. Phrased as questions, not accusations.</Note>
                {higher.length ? (
                  <ul className="divide-y divide-rule border-y border-rule">
                    {higher.map((b) => (
                      <li key={b.id} className="py-2.5 text-sm">
                        <span className="text-2xs text-ink-3 uppercase">{BLIND_SPOT_LABEL[b.category]}</span>
                        <p className="text-ink">{b.question}</p>
                        <p className="mt-0.5 text-xs text-ink-3">Basis: {b.basis}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-3">No higher-importance gaps were raised by the rules.</p>
                )}
                {unsupportedMaterial.length > 0 && (
                  <Sub title={`Material statements without independent support (${unsupportedMaterial.length})`}>
                    <ClaimList ids={unsupportedMaterial.map((c) => c.id)} empty="" />
                  </Sub>
                )}
              </div>
            </Section>

            <Section id="questions" n={15} title="Unresolved questions" meta={`${x.blindSpots.length + x.milestones.reduce((s, ms) => s + ms.questions.length, 0)} open`}>
              <div className="max-w-[880px] space-y-5">
                {[...higher, ...standard].length > 0 && (
                  <ul className="divide-y divide-rule border-y border-rule">
                    {[...higher, ...standard].map((b) => (
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
                <Sub title="Milestone questions">
                  {x.milestones.some((ms) => ms.questions.length) ? (
                    <ul className="space-y-1 text-sm">
                      {x.milestones.flatMap((ms) =>
                        ms.questions.map((q) => (
                          <li key={`${ms.id}-${q.code}`}>
                            <span className="num mr-2 text-xs text-ink-3">M{ms.index + 1}</span>
                            {q.question}
                          </li>
                        )),
                      )}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-3">The milestone rules raised no questions.</p>
                  )}
                </Sub>
              </div>
            </Section>

            <Section id="sources" n={16} title="Evidence sources" meta={`${x.evidence.length} records`}>
              <div className="space-y-5">
                {[...evidenceByKind.entries()].map(([kind, list]) => (
                  <Sub key={kind} title={`${EVIDENCE_KIND_LABEL[kind]} (${list.length})`}>
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

            <Section id="corrections" n={17} title="Corrections" meta={corrections.length ? `${corrections.length} applied` : "None applied"}>
              <div className="max-w-[820px] space-y-4">
                <p className="text-sm text-ink-2">{CORRECTION_NOTICE}</p>
                <div className="flex flex-wrap items-center gap-4">
                  <CorrectionButton type="initiative" id={ini.id} label={ini.title} className="rounded-sm border border-rule-2 px-2.5 py-1 text-ink-2 no-underline hover:border-ink-3">
                    Suggest a correction to this dossier
                  </CorrectionButton>
                  <Link href="/corrections" className="text-xs text-ink-3 hover:text-accent">
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

            <Section id="history" n={18} title="Proposal history" meta={`${x.revisions.length} official revisions`}>
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
