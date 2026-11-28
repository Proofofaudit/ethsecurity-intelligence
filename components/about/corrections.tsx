import Link from "next/link";
import { ExternalLink } from "@/components/ui/button";
import { Block, Note, PageHead } from "@/components/ui/layout";
import { DateTime } from "@/components/ui/money";
import { StatusMark } from "@/components/ui/status";
import { CATEGORY_LABEL, CHANGELOG_STATES, CORRECTION_NOTICE, STATE_LABEL, toChangelogEntry } from "@/lib/corrections";
import { correctionsStoreNotice } from "@/lib/corrections/store-status";
import { loadIntelligence } from "@/lib/intelligence/load";
import { displayName } from "@/lib/intelligence/service";

export async function CorrectionsSection() {
  const { dataset: d, store, health } = await loadIntelligence();
  let entries: NonNullable<ReturnType<typeof toChangelogEntry>>[] = [];
  let failed = false;
  try {
    entries = (await store.listCorrections({ states: CHANGELOG_STATES }))
      .map(toChangelogEntry)
      .filter((x) => x !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    failed = true;
  }
  const notice = correctionsStoreNotice({ failed, degraded: health.degraded || !health.ok, backend: health.backend });
  const byId = new Map(d.initiatives.map((i) => [i.id, i]));
  const claims = new Map(d.claims.map((c) => [c.id, c]));

  return (
    <div className="space-y-10">
      <PageHead
        as="h2"
        eyebrow="Reference · Public corrections"
        title="Corrections changelog"
        lede={<p>{CORRECTION_NOTICE}</p>}
      />

      {notice && (
        <div role="alert" className="max-w-[860px] border border-rule-2 bg-paper-2 px-4 py-3 text-sm">
          <p className="font-medium text-st-contradicted">{notice.title}</p>
          <p className="mt-1 text-ink-2">{notice.body}</p>
        </div>
      )}

      <Block title="How to submit a correction">
        <ol className="max-w-[860px] list-decimal space-y-1 pl-5 text-sm text-ink-2">
          <li>
            Open the initiative in{" "}
            <Link href="/initiatives" className="link">
              Research
            </Link>{" "}
            and select the statement. Its source inspector has &ldquo;Suggest a correction to this statement&rdquo;. Each dossier header also has &ldquo;Suggest a correction&rdquo; for the initiative as a whole.
          </li>
          <li>Choose a category, describe the correction and link public evidence over https. A short explanation helps the moderator.</li>
          <li>Public attribution and a private contact address are optional. A private contact is stored encrypted and is never published.</li>
          <li>A moderator reviews the submission. Nothing changes in the research record until a correction is accepted; accepted changes then apply everywhere the statement appears.</li>
        </ol>
        <p className="mt-3 text-xs text-ink-3">Categories: {Object.values(CATEGORY_LABEL).join(" · ")}. States: {Object.values(STATE_LABEL).join(" · ")}.</p>
      </Block>

      <Block title={`Moderated corrections (${entries.length})`} note="Only corrections a moderator has accepted, partially accepted, rejected with reasoning or resolved are listed. Rejected submissions show the category and the reasoning only.">
        {failed ? (
          <p role="alert" className="text-sm text-st-contradicted">
            The corrections list could not be read. Please try again later.
          </p>
        ) : entries.length === 0 ? (
          <Note>No correction has been moderated yet.</Note>
        ) : (
          <ol className="divide-y divide-rule">
            {entries.map((e) => {
              const ini = e.initiativeId ? byId.get(e.initiativeId) : undefined;
              const claim = e.targetType === "claim" ? claims.get(e.targetId) : undefined;
              return (
                <li key={e.id} className="grid gap-x-6 gap-y-1 py-3 md:grid-cols-[160px_minmax(0,1fr)]">
                  <div className="text-xs text-ink-3">
                    <DateTime iso={e.updatedAt} />
                    <span className="block font-medium text-ink">{e.stateLabel}</span>
                  </div>
                  <div className="min-w-0 text-sm">
                    <p>
                      {ini ? (
                        <Link href={claim ? `/initiatives/${ini.slug}#claim=${claim.id}` : `/initiatives/${ini.slug}#corrections`} className="font-medium hover:text-accent">
                          {displayName(d, ini)}
                        </Link>
                      ) : (
                        <span className="font-medium">Cohort</span>
                      )}
                      <span className="text-ink-3"> · {e.categoryLabel}</span>
                    </p>
                    {claim && <p className="mt-0.5 text-xs text-ink-2">Statement: {claim.assertion}</p>}
                    {e.proposedCorrection && <p className="mt-1 text-ink-2">{e.proposedCorrection}</p>}
                    {e.resolution && <p className="mt-1 text-xs text-ink-2">Moderator: {e.resolution}</p>}
                    {e.appliedChange?.status && (
                      <p className="mt-1 flex items-center gap-2 text-xs">
                        Applied status <StatusMark status={e.appliedChange.status} />
                      </p>
                    )}
                    {e.evidenceUrl && (
                      <p className="mt-1 text-xs">
                        <ExternalLink href={e.evidenceUrl}>Evidence</ExternalLink>
                      </p>
                    )}
                    {e.attribution && <p className="mt-1 text-xs text-ink-3">Submitted by {e.attribution}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Block>
    </div>
  );
}
