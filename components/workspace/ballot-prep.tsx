"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/form";
import { ArrowUpRight } from "@/components/ui/icons";
import { OfficialQuote } from "@/components/ui/official-quote";
import { NEUTRAL_SORT_LABEL } from "@/lib/neutralLanguage";
import { formatUsd } from "@/lib/util/money";
import { cn } from "@/lib/util/cn";
import { checkBallot, fixFor, formatMicroUsd, shareText, TIERS, type BallotChecks, type BallotProject, type Draft, type Tier } from "@/lib/vote/ballot-rules";
import { VOTE_APP_URL, VOTING_POST_URL } from "@/lib/vote/calendar";
import { isFlagged, POSSIBLY_OWN, S_TIER_REMINDER } from "@/lib/vote/affiliation";
import type { AffiliationView, BallotView } from "@/lib/vote/view-data";
import { AffiliationDetail, AffiliationTag, SharedGroupLine, useAffiliationFlags } from "./affiliations";
import type { AskDelta } from "./schema";
import { AskDeltaNote } from "./since-visit";
import { clearBallotDraft, setBallotTier, useWorkspace } from "./store";

export const PRECHECK_LABEL = "Unofficial pre-check. The on-chain contract is final.";
export const TIP_TEXT = "Be generous with B-tier; it only gets money after S and A.";
export const DRAFT_FORMAT = "ethsecurity-intelligence/ballot-draft@1";

type Choice = Tier | "Off";
const CHOICES: { value: Choice; label: string }[] = [
  { value: "S", label: "S" },
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "Off", label: "Off" },
];

function Verdict({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="text-xs font-medium text-ink-3">Not computed</span>;
  return <span className={cn("text-xs font-medium whitespace-nowrap", ok ? "text-st-verified" : "text-st-contradicted")}>{ok ? "Passes" : "Fails"}</span>;
}

function RuleRow({ n, title, ok, children, fix }: { n: string; title: string; ok: boolean | null; children: ReactNode; fix: string | null }) {
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-x-2 py-2" data-rule={n} data-ok={ok === null ? "null" : String(ok)}>
      <span className="num text-xs text-ink-3">{n}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <div className="mt-0.5 text-xs text-ink-2">{children}</div>
        {fix && (
          <p className="mt-1 text-xs text-ink" data-fix>
            Fix: {fix}
          </p>
        )}
      </div>
      <Verdict ok={ok} />
    </li>
  );
}

/** Plain-text summary of the draft: tier lists and rule results only. */
function draftText(view: BallotView, checks: BallotChecks | null, label: (id: string) => string, datasetVersion: string): string {
  const lines = [`Ballot Prep draft. ${PRECHECK_LABEL}`, `Dataset ${datasetVersion}${view.poolMicro ? `, pool ${formatMicroUsd(BigInt(view.poolMicro))}` : ""}.`];
  const tiers = checks?.tiers ?? null;
  for (const t of TIERS) {
    const ids = tiers ? tiers[t] : [];
    lines.push(`${t}-tier (${ids.length}): ${ids.length ? ids.map(label).join("; ") : "none"}`);
  }
  if (!checks) lines.push("Rule checks: off (manifest unavailable).");
  else {
    lines.push(`Rule 1, ballot size: ${checks.size.ok === null ? "not computed" : checks.size.ok ? "passes" : "fails"}${checks.size.requestedMicro !== null && checks.size.neededMicro !== null ? ` (${formatMicroUsd(checks.size.requestedMicro)} of ${formatMicroUsd(checks.size.neededMicro)})` : ""}`);
    for (const c of checks.independent) lines.push(`Rule 2, ${c.tier}-tier unaffiliated initiatives: ${c.ok ? "passes" : "fails"} (${c.found} of 3 found)`);
    for (const c of checks.group) lines.push(`Rule 3, ${c.tier}-tier affiliated share: ${c.ok ? "passes" : "fails"}${c.groups.length ? ` (${c.groups.map((g) => `${g.group} ${shareText(g.goalMicro, c.tierGoalMicro)}`).join(", ")})` : " (no affiliation group in the tier)"}`);
    lines.push(`Tier order: ${checks.order.ok ? "passes" : "fails"}`);
  }
  lines.push(`Official ballot: ${VOTE_APP_URL}`);
  return lines.join("\n");
}

export function BallotPrep({ view, datasetVersion, deltas, affiliation }: { view: BallotView; datasetVersion: string; deltas: Map<string, AskDelta>; affiliation: AffiliationView }) {
  const w = useWorkspace();
  const flags = useAffiliationFlags(affiliation.targets);
  const anyFlagged = view.items.some((i) => isFlagged(flags.get(i.id) ?? null));
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const draft: Draft = useMemo(() => w.ballotDraft?.tiers ?? {}, [w.ballotDraft]);
  const byId = useMemo(() => new Map(view.items.map((i) => [i.id, i])), [view.items]);
  const label = (id: string) => byId.get(id)?.label ?? id;

  const checks = useMemo<BallotChecks | null>(() => {
    if (view.disabledReason || !view.poolMicro) return null;
    const projects: BallotProject[] = view.items.map((i) => ({ id: i.id, goalMicro: BigInt(i.goalMicro as string), askMicro: i.askCents === null ? null : BigInt(i.askCents) * 10_000n, groups: i.groups }));
    return checkBallot({ projects, poolMicro: BigInt(view.poolMicro), independentTiers: view.independentTiers }, draft);
  }, [view, draft]);

  const counts = Object.fromEntries(TIERS.map((t) => [t, Object.values(draft).filter((x) => x === t).length])) as Record<Tier, number>;
  const off = view.items.length - counts.S - counts.A - counts.B;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draftText(view, checks, label, datasetVersion));
      setMessage({ tone: "ok", text: "Draft copied to the clipboard." });
    } catch {
      setMessage({ tone: "error", text: "The browser blocked clipboard access. Use Export JSON instead." });
    }
  };
  const exportJson = () => {
    const tiers = Object.fromEntries(TIERS.map((t) => [t, view.items.filter((i) => draft[i.id] === t).map((i) => ({ slug: i.slug, title: i.label }))]));
    const out = {
      format: DRAFT_FORMAT,
      exportedAt: new Date().toISOString(),
      note: `${PRECHECK_LABEL} Created in a browser; never sent to the server.`,
      datasetVersion,
      poolMicroUsd: view.poolMicro,
      tiers,
      checks: checks
        ? {
            size: { ok: checks.size.ok, requestedMicroUsd: checks.size.requestedMicro?.toString() ?? null, neededMicroUsd: checks.size.neededMicro?.toString() ?? null, thresholdMicroUsd: checks.size.thresholdMicro.toString() },
            independent: checks.independent.map((c) => ({ tier: c.tier, ok: c.ok, found: c.found })),
            group: checks.group.map((c) => ({ tier: c.tier, ok: c.ok, tierGoalMicroUsd: c.tierGoalMicro.toString(), groups: c.groups.map((g) => ({ group: g.group, goalMicroUsd: g.goalMicro.toString(), ok: g.ok })) })),
            order: { ok: checks.order.ok },
          }
        : null,
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ballot-prep-draft-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ tone: "ok", text: "Draft exported as a JSON file." });
  };

  const sz = checks?.size;
  return (
    <section id="ballot-prep" aria-labelledby="ballot-prep-h" data-ballot-prep className="scroll-mt-20 border-t border-ink pt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="ballot-prep-h" className="text-md font-semibold">
          Ballot Prep{" "}
          <span className="num text-sm font-normal text-ink-3">
            S {counts.S} · A {counts.A} · B {counts.B} · Off {off}
          </span>
        </h2>
        <p className="text-xs font-medium" data-precheck-label>
          {PRECHECK_LABEL}
        </p>
      </div>
      <p className="mb-3 max-w-[820px] text-xs text-ink-3">
        A private draft of S, A and B tiers, checked against the official ballot rules. It is separate from the What-if laboratory. This page never connects a wallet, signs or submits anything; the draft stays in this browser until you clear it.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void copy()}>
          Copy draft
        </Button>
        <Button size="sm" onClick={exportJson}>
          Export JSON
        </Button>
        <a href={VOTE_APP_URL} target="_blank" rel="noopener noreferrer" className={buttonClass("default", "sm")}>
          Open official ballot
          <ArrowUpRight />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (window.confirm("Clear your Ballot Prep draft in this browser?")) {
              clearBallotDraft();
              setMessage({ tone: "ok", text: "Draft cleared." });
            }
          }}
        >
          Clear my draft
        </Button>
      </div>
      {message && (
        <p role="status" className={cn("mb-3 text-sm", message.tone === "error" ? "text-st-contradicted" : "text-st-verified")}>
          {message.text}
        </p>
      )}

      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] [&>*]:min-w-0">
        <div className="space-y-4">
          <p className="eyebrow">TheDAO&apos;s tier terms</p>
          <OfficialQuote source={VOTING_POST_URL} sourceName="TheDAO's voting post, 17 Nov 2026">
            <span className="block">S-Tier: must fund</span>
            <span className="block">A-Tier: should fund</span>
            <span className="block">B-Tier: nice to have</span>
          </OfficialQuote>
          <OfficialQuote source={VOTING_POST_URL} sourceName="TheDAO's tip for Badge holders" paraphrase>
            {TIP_TEXT}
          </OfficialQuote>
          <p className="text-xs text-ink-3">These are TheDAO&apos;s definitions. This site does not suggest where any initiative belongs.</p>

          <div>
            <p className="eyebrow mb-1">Rule checks</p>
            {!checks ? (
              <p className="border-l-2 border-st-partial pl-3 text-sm text-ink-2" data-checks-disabled>
                {view.disabledReason ?? "The pool value is unavailable, so the rule checks are off."}
              </p>
            ) : (
              <ol className="divide-y divide-rule border-y border-rule">
                <RuleRow n="1" title="Ballot size: asks on the ballot reach 1.5 × the pool" ok={sz!.ok} fix={fixFor(sz!)}>
                  {sz!.requestedMicro !== null && sz!.neededMicro !== null ? (
                    <>
                      <span className="num">{formatMicroUsd(sz!.requestedMicro)}</span> of <span className="num">{formatMicroUsd(sz!.neededMicro)}</span> needed. 1.5 × pool <span className="num">{formatMicroUsd(BigInt(view.poolMicro!))}</span> = <span className="num">{formatMicroUsd(sz!.thresholdMicro)}</span>
                      {sz!.capped ? ", capped at the sum of all asks in the round." : "."}
                    </>
                  ) : (
                    "A TheDAO ask is unavailable, so the sum cannot be computed."
                  )}
                </RuleRow>
                {checks.independent.map((c) => (
                  <RuleRow key={`i${c.tier}`} n="2" title={`${c.tier}-tier holds at least 3 unaffiliated initiatives`} ok={c.ok} fix={fixFor(c)}>
                    <span className="num">{c.tierCount}</span> in {c.tier}-tier; <span className="num">{c.found}</span> of 3 pairwise unaffiliated found
                    {c.ok ? `: ${c.proof.map(label).join(", ")}.` : "."}
                    {c.related.length > 0 && <> Shared groups: {c.related.map((r) => `${r.group} (${r.ids.length})`).join(", ")}.</>}
                  </RuleRow>
                ))}
                {checks.group.map((c) => (
                  <RuleRow key={`g${c.tier}`} n="3" title={`Affiliated initiatives in ${c.tier}-tier hold at most 50% of its goals`} ok={c.ok} fix={c.groups.map(fixFor).find((x) => x) ?? null}>
                    {c.groups.length === 0 ? (
                      <>No affiliation group in {c.tier}-tier.</>
                    ) : (
                      <ul className="space-y-0.5">
                        {c.groups.map((g) => (
                          <li key={g.group} className={cn(!g.ok && "text-st-contradicted")}>
                            {g.group}: <span className="num">{formatMicroUsd(g.goalMicro)}</span> of <span className="num">{formatMicroUsd(c.tierGoalMicro)}</span> ({shareText(g.goalMicro, c.tierGoalMicro)}, {g.ids.length} {g.ids.length === 1 ? "initiative" : "initiatives"})
                          </li>
                        ))}
                      </ul>
                    )}
                  </RuleRow>
                ))}
                <RuleRow n="·" title="Tier order: no empty tier before a used one" ok={checks.order.ok} fix={fixFor(checks.order)}>
                  The official app requires a pick in each earlier tier before a later tier is used.
                </RuleRow>
              </ol>
            )}
            <p className="mt-2 text-2xs text-ink-3">
              Rules from TheDAO&apos;s voting post, computed as the official vote app does: asks for rule 1, registered goals for rule 3, affiliation groups from the vote manifest (initiatives without groups, including every RFP, count as unaffiliated). Asks come from the published dataset, rounded to the cent; the
              official app reads live onchain asks, which move with each donation or pledge.
            </p>
          </div>
        </div>

        <div>
          <p className="eyebrow mb-1">
            {view.items.length} initiatives · {NEUTRAL_SORT_LABEL}
          </p>
          {anyFlagged && (
            <p className="mb-2 border-l-2 border-st-partial pl-3 text-xs text-ink-2" data-s-tier-reminder>
              {S_TIER_REMINDER}
            </p>
          )}
          <ul className="divide-y divide-rule border-y border-rule">
            {view.items.map((i) => {
              const choice: Choice = draft[i.id] ?? "Off";
              return (
                <li key={i.id} className="grid items-center gap-x-4 gap-y-1.5 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto]" data-ballot-item={i.slug} data-tier={choice}>
                  <div className="min-w-0">
                    <Link href={`/initiatives/${i.slug}`} className="font-medium hover:text-accent">
                      {i.label}
                    </Link>
                    <span className="block text-xs text-ink-3">
                      {i.sub ?? "No designated recipient"} · Goal <span className="num">{i.goalMicro ? formatMicroUsd(BigInt(i.goalMicro)) : "Unavailable"}</span> · TheDAO ask <span className="num">{formatUsd(i.askCents)}</span> · {i.groups.length ? `Affiliation: ${i.groups.join(", ")}` : "Unaffiliated"}
                    </span>
                    <AskDeltaNote delta={deltas.get(i.id)} className="block text-xs text-ink-2" />
                    <SharedGroupLine groups={affiliation.shared[i.id]} />
                    <AffiliationDetail flag={flags.get(i.id)} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 justify-self-start sm:justify-self-end sm:justify-end">
                    <AffiliationTag flag={flags.get(i.id)} label={POSSIBLY_OWN} detail={false} />
                    <Segmented<Choice> label={`Tier for ${i.label}`} value={choice} options={CHOICES} onChange={(v) => setBallotTier(i.id, v === "Off" ? null : v)} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
