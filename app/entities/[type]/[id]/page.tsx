import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ExternalLink } from "@/components/ui/button";
import { Block, Note, PageHead } from "@/components/ui/layout";
import { DateTime, formatDate, Money } from "@/components/ui/money";
import { StatusMark } from "@/components/ui/status";
import { Round1History } from "@/components/dossier/round1";
import { entityExists } from "@/lib/api/entity";
import { BANNER_HREF, COI_SHORT, isCoiOrganization } from "@/lib/disclosure";
import { EntityType, type Dataset } from "@/lib/domain/schemas";
import { loadIntelligence } from "@/lib/intelligence/load";
import { displayName, entityLabel, entityProfile, findInitiative } from "@/lib/intelligence/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ type: string; id: string }> };

const RESOLUTION_LABEL: Record<string, string> = {
  exact_normalized: "Same name after normalizing case and punctuation",
  same_official_domain: "Same official website",
  curated_with_evidence: "Matched by a researcher with cited sources",
  candidate_unconfirmed: "Similar name, not confirmed as the same entity",
  anonymous_not_merged: "Anonymous label, never merged",
};

const TYPE_TITLE: Partial<Record<EntityType, string>> = {
  organization: "Organization",
  repository: "Repository",
  person: "Public contributor",
  standard: "Standard",
  problem: "Security problem",
  product: "Product",
};

async function resolve(p: { type: string; id: string }) {
  const id = decodeURIComponent(p.id).slice(0, 160);
  const parsed = EntityType.safeParse(p.type === "backer" ? "organization" : p.type);
  if (!parsed.success) return null;
  const { dataset: d } = await loadIntelligence();
  return { d, type: parsed.data, id };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const r = await resolve(await params);
  if (!r) return { title: "Not found" };
  return { title: entityLabel(r.d, r.type, r.id).label };
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-3">{k}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function InitiativeList({ d, ids, empty }: { d: Dataset; ids: string[]; empty: string }) {
  const list = ids.map((id) => findInitiative(d, id)).filter((x) => !!x);
  if (!list.length) return <Note>{empty}</Note>;
  return (
    <ul className="grid gap-x-8 md:grid-cols-2">
      {list.map((i) => (
        <li key={i.id} className="border-b border-rule py-2 text-sm">
          <Link href={`/initiatives/${i.slug}`} className="font-medium hover:text-accent">
            {displayName(d, i)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function EntityPage({ params }: Params) {
  const r = await resolve(await params);
  if (!r) notFound();
  const { d, type, id } = r;
  if (type === "initiative") {
    const i = findInitiative(d, id);
    if (!i) notFound();
    redirect(`/initiatives/${i.slug}`);
  }
  if (type === "milestone") {
    const m = d.milestones.find((x) => x.id === id);
    const i = m && d.initiatives.find((x) => x.id === m.initiativeId);
    if (!i) notFound();
    redirect(`/initiatives/${i.slug}#milestones`);
  }
  if (!entityExists(d, type, id)) notFound();
  const p = entityProfile(d, type, id);
  if (!p) notFound();
  const { label, sub } = entityLabel(d, type, id);
  const graphHref = `/teams?type=${type}&id=${encodeURIComponent(id)}`;
  const dl = "grid grid-cols-[minmax(0,10rem)_1fr] gap-x-4 gap-y-2 text-sm max-sm:grid-cols-1 max-sm:[&>dt]:mt-2";

  return (
    <article className="space-y-10">
      <nav aria-label="Breadcrumb" className="text-xs text-ink-3">
        <Link href="/teams" className="hover:text-accent">
          Relationship graph
        </Link>
        <span className="mx-1.5">/</span>
        <span>{TYPE_TITLE[type] ?? type}</span>
      </nav>
      <PageHead
        className="mb-0"
        eyebrow={TYPE_TITLE[type] ?? type}
        title={label}
        lede={sub ? <p>{sub}</p> : undefined}
        aside={
          <Link href={graphHref} className="inline-flex h-8 items-center rounded-sm border border-rule-2 px-3 text-sm hover:border-ink-3">
            Open in the relationship graph
          </Link>
        }
      />

      {p.type === "organization" && "organization" in p && (
        <>
          {(() => {
            const o = p.organization;
            const pledged = p.pledges.filter((x) => x.status === "pledged").reduce((s, x) => s + x.amountCents, 0);
            const received = p.pledges.filter((x) => x.status === "received").reduce((s, x) => s + x.amountCents, 0);
            return (
              <>
                {isCoiOrganization(o.id) && (
                  <aside className="border-l-2 border-ink bg-paper-2 px-4 py-3 text-sm" aria-label="Conflict of interest">
                    {COI_SHORT} The profile is produced by the same rules as every other organization.{" "}
                    <Link href={BANNER_HREF} className="link">
                      Read the disclosure
                    </Link>
                    .
                  </aside>
                )}
                <Block title="Profile">
                  <dl className={dl}>
                    <Row k="Role in this round">{o.kind === "both" ? "Recipient and backer" : o.kind === "recipient" ? "Recipient" : o.kind === "backer" ? "Backer" : "Related"}</Row>
                    <Row k="Official spellings">{o.names.join(" · ")}</Row>
                    {o.anonymous && <Row k="Identity">Anonymous or individual label. Pledges under this label are never merged with other backers.</Row>}
                    {o.website && (
                      <Row k="Website">
                        <ExternalLink href={o.website}>{o.website.replace(/^https?:\/\//, "")}</ExternalLink>
                        {o.websiteCheck && (
                          <span className="ml-2 text-xs text-ink-3">
                            {o.websiteCheck.ok ? `Reachable (HTTP ${o.websiteCheck.status})` : `Not reachable${o.websiteCheck.status ? ` (HTTP ${o.websiteCheck.status})` : ""}`} on {formatDate(o.websiteCheck.checkedAt)}
                          </span>
                        )}
                      </Row>
                    )}
                    {o.websiteCheck?.description && (
                      <Row k="Website description">
                        &ldquo;{o.websiteCheck.description}&rdquo; <span className="text-xs text-ink-3">(the site&apos;s own meta description, quoted)</span>
                      </Row>
                    )}
                    {o.githubProfile && (
                      <Row k="GitHub">
                        <ExternalLink href={o.githubProfile.url}>{o.githubProfile.login}</ExternalLink>
                        <span className="ml-2 text-xs text-ink-3">
                          {o.githubProfile.type}
                          {o.githubProfile.publicRepos !== null && `, ${o.githubProfile.publicRepos} public repositories`}
                          {o.githubProfile.createdAt && `, created ${formatDate(o.githubProfile.createdAt)}`}
                        </span>
                      </Row>
                    )}
                    <Row k="Pledged by this organization">
                      <Money cents={pledged + received} /> <span className="text-xs text-ink-3">(outstanding <Money cents={pledged} />, received <Money cents={received} />)</span>
                    </Row>
                  </dl>
                  {o.notes.length > 0 && (
                    <ul className="mt-4 space-y-2 text-sm">
                      {o.notes.map((n, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <StatusMark status={n.status} />
                          <span>{n.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Block>
                <Block title={`Initiatives proposed (${p.proposes.length})`}>
                  <InitiativeList d={d} ids={p.proposes.map((x) => x.id)} empty="This organization is not the recipient of a cohort initiative." />
                </Block>
                {p.round1 && (
                  <Block title="Round 1 history" id="round1" note="TheDAO / Giveth Round 1 records linked to this organization or its initiatives, each with its stated reason.">
                    <Round1History view={p.round1} subject={{ label: "Organization website", href: o.website }} />
                  </Block>
                )}
                <Block title={`Pledges made (${p.pledges.length})`} note="Official pledge records. Received pledges have arrived onchain and are counted inside donations.">
                  {p.pledges.length === 0 ? (
                    <Note>No pledge records.</Note>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-sm">
                        <caption className="sr-only">Pledges made by {label}</caption>
                        <thead>
                          <tr className="border-b border-ink text-left text-2xs tracking-wide text-ink-3 uppercase">
                            <th scope="col" className="py-2 pr-3 font-medium">
                              Initiative
                            </th>
                            <th scope="col" className="py-2 pr-3 font-medium">
                              Name on record
                            </th>
                            <th scope="col" className="py-2 pr-3 font-medium">
                              Status
                            </th>
                            <th scope="col" className="py-2 pr-3 font-medium">
                              Recorded
                            </th>
                            <th scope="col" className="py-2 text-right font-medium">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.pledges.map((x) => {
                            const i = findInitiative(d, x.initiativeId);
                            return (
                              <tr key={x.id} className="border-b border-rule">
                                <td className="py-2 pr-3">
                                  {i ? (
                                    <Link href={`/initiatives/${i.slug}#financial`} className="hover:text-accent">
                                      {displayName(d, i)}
                                    </Link>
                                  ) : (
                                    x.initiative
                                  )}
                                </td>
                                <td className="py-2 pr-3 text-ink-2">{x.company}</td>
                                <td className="py-2 pr-3">{x.status === "received" ? "Received" : "Outstanding"}</td>
                                <td className="py-2 pr-3">
                                  <DateTime iso={x.createdAt} className="text-xs" />
                                </td>
                                <td className="py-2 text-right">
                                  <Money cents={x.amountCents} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Block>
                {(p.aliases.length > 0 || p.people.length > 0 || p.repositories.length > 0) && (
                  <div className="grid gap-10 lg:grid-cols-2 [&>*]:min-w-0">
                    {p.aliases.length > 0 && (
                      <Block title="Name matching" note="How official name spellings were linked to this entity.">
                        <ul className="divide-y divide-rule text-sm">
                          {p.aliases.map((a) => {
                            const other = a.candidateOrganizationId && a.candidateOrganizationId !== o.id ? a.candidateOrganizationId : a.organizationId !== o.id ? a.organizationId : null;
                            return (
                              <li key={a.id} className="py-2">
                                <p>
                                  &ldquo;{a.alias}&rdquo;{" "}
                                  {other && (
                                    <>
                                      and{" "}
                                      <Link href={`/entities/organization/${encodeURIComponent(other)}`} className="link">
                                        {d.organizations.find((x) => x.id === other)?.name ?? other}
                                      </Link>
                                    </>
                                  )}
                                </p>
                                <p className={a.resolution === "candidate_unconfirmed" ? "text-xs text-st-partial" : "text-xs text-ink-2"}>{RESOLUTION_LABEL[a.resolution] ?? a.resolution}</p>
                                <p className="text-xs text-ink-3">{a.reason}</p>
                              </li>
                            );
                          })}
                        </ul>
                      </Block>
                    )}
                    {(p.people.length > 0 || p.repositories.length > 0) && (
                      <Block title="People and repositories">
                        <ul className="divide-y divide-rule text-sm">
                          {p.people.map((x) => (
                            <li key={x.id} className="py-2">
                              <Link href={`/entities/person/${encodeURIComponent(x.id)}`} className="hover:text-accent">
                                {x.name}
                              </Link>
                              {x.role && <span className="text-xs text-ink-3"> · {x.role}</span>}
                            </li>
                          ))}
                          {p.repositories.map((x) => (
                            <li key={x.id} className="py-2">
                              <Link href={`/entities/repository/${encodeURIComponent(x.id)}`} className="hover:text-accent">
                                {x.fullName}
                              </Link>
                              <span className="text-xs text-ink-3"> · maintained (repository owner matches the official GitHub link)</span>
                            </li>
                          ))}
                        </ul>
                      </Block>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}

      {p.type === "repository" && "repository" in p && (
        <>
          <Block title="Repository" note={`Observed through the GitHub REST API on ${formatDate(p.repository.checkedAt)}. Activity describes what exists publicly; it is not a measure of security quality.`}>
            <dl className={dl}>
              <Row k="Address">
                <ExternalLink href={p.repository.url}>{p.repository.fullName}</ExternalLink>
              </Row>
              <Row k="Public">{p.repository.exists ? "Yes" : `Not found${p.repository.error ? ` (${p.repository.error})` : ""}`}</Row>
              {p.repository.description && <Row k="Description">{p.repository.description}</Row>}
              {p.repository.language && <Row k="Main language">{p.repository.language}</Row>}
              {p.repository.license && <Row k="License">{p.repository.license}</Row>}
              <Row k="Created">{formatDate(p.repository.createdAt)}</Row>
              <Row k="Last push">{formatDate(p.repository.pushedAt)}</Row>
              <Row k="Commits in 90 days">{p.repository.commitsLast90d === null ? "Unknown" : <span className="num">{p.repository.commitsLast90d}</span>}</Row>
              <Row k="Releases">{p.repository.releaseCount === null ? "Unknown" : <span className="num">{p.repository.releaseCount}</span>}</Row>
              <Row k="CI workflows">{p.repository.hasCiWorkflows === null ? "Unknown" : p.repository.hasCiWorkflows ? "Present" : "None found"}</Row>
              <Row k="Security policy">{p.repository.hasSecurityPolicy === null ? "Unknown" : p.repository.hasSecurityPolicy ? "Present" : "None found"}</Row>
              {p.repository.archived && <Row k="Archived">Yes</Row>}
              {p.repository.fork && <Row k="Fork">Yes</Row>}
            </dl>
          </Block>
          <Block title="Cited by">
            <InitiativeList d={d} ids={p.initiatives.map((x) => x.id)} empty="Not cited by a cohort initiative." />
          </Block>
        </>
      )}

      {p.type === "person" && "person" in p && (
        <>
          <Block title="Public contributor" note="Only names and profiles published in proposal text or official records are shown.">
            <dl className={dl}>
              {p.person.role && <Row k="Role stated">{p.person.role}</Row>}
              <Row k="Public profiles">
                {p.person.publicProfiles.length ? (
                  <ul className="space-y-1">
                    {p.person.publicProfiles.map((u) => (
                      <li key={u}>
                        <ExternalLink href={u}>{u.replace(/^https?:\/\//, "")}</ExternalLink>
                      </li>
                    ))}
                  </ul>
                ) : (
                  "None recorded"
                )}
              </Row>
            </dl>
          </Block>
          <Block title="Initiatives">
            <InitiativeList d={d} ids={p.initiatives.map((x) => x.id)} empty="None." />
          </Block>
        </>
      )}

      {p.type === "standard" && "standard" in p && (
        <Block title={`Initiatives referencing ${p.standard}`} note="Found by the pattern ERC-, EIP- or RIP- followed by a number in proposal text." href={p.url ?? undefined} hrefLabel={p.url ? "Specification" : undefined}>
          <InitiativeList d={d} ids={p.initiatives.map((x) => x.id)} empty="None." />
        </Block>
      )}

      {p.type === "problem" && "stage" in p && (
        <Block title={`${p.stage.totalCount} initiatives map to this stage`} note={p.stage.description} href={`/initiatives#coverage`} hrefLabel="Coverage map">
          <InitiativeList d={d} ids={p.stage.initiatives.map((x) => x.id)} empty="No cohort initiative maps to this stage. That says nothing about work outside the cohort." />
        </Block>
      )}

      {p.type === "product" && "product" in p && (
        <Block title="Product or site" note="Reachability is an HTTP check by the research pipeline.">
          <dl className={dl}>
            <Row k="Address">
              <ExternalLink href={p.product.url}>{p.product.url.replace(/^https?:\/\//, "")}</ExternalLink>
            </Row>
            {p.product.title && <Row k="Page title">&ldquo;{p.product.title}&rdquo;</Row>}
            <Row k="Reachable">{p.product.reachable === null ? "Not checked" : p.product.reachable ? `Yes (HTTP ${p.product.status})` : `No${p.product.status ? ` (HTTP ${p.product.status})` : ""}`}</Row>
            <Row k="Checked">{formatDate(p.product.checkedAt)}</Row>
            <Row k="Initiatives">
              {p.product.initiativeIds
                .map((x) => findInitiative(d, x))
                .filter((x) => !!x)
                .map((i, n) => (
                  <span key={i.id}>
                    {n > 0 && ", "}
                    <Link href={`/initiatives/${i.slug}`} className="link">
                      {displayName(d, i)}
                    </Link>
                  </span>
                ))}
            </Row>
          </dl>
        </Block>
      )}
    </article>
  );
}
