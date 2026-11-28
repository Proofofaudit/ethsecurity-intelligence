"use client";

import { useMemo, useState } from "react";
import { AiInterpretation, NotYetResearched } from "@/components/ui/ai-interpretation";
import { prepareAiInterpretation, type AiProvenance } from "@/lib/ai/interpretation";
import { ResearchOutputSchema, type ResearchOutput } from "@/lib/skills/schema";

const KIND_LABEL: Record<ResearchOutput["initiatives"][number]["findings"][number]["kind"], string> = {
  established: "Reported as established",
  applicant_says: "Applicant statement, as quoted",
  future_plan: "Future plan, not an existing capability",
  open_question: "Open question",
  inference: "Inference",
};

const host = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};

const norm = (u: string) => u.replace(/\/+$/, "");

/** Keeps only citations the assistant reports it examined. Others are dropped, so they are never shown as sources. */
export function examinedCitations(urls: readonly string[], examined: readonly string[]): { url: string; label: string }[] {
  const ok = new Set(examined.map(norm));
  return urls.filter((u) => ok.has(norm(u))).map((u) => ({ url: u, label: host(u) }));
}

export type ReadResult = { ok: true; value: ResearchOutput } | { ok: false; error: string };

/** Parses pasted JSON against ResearchOutputSchema. Pure, so tests can call it. */
export function readResearchResult(raw: string): ReadResult {
  if (!raw.trim()) return { ok: false, error: "Paste the JSON result from your assistant." };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "This is not valid JSON." };
  }
  const r = ResearchOutputSchema.safeParse(json);
  if (!r.success) {
    const first = r.error.issues[0];
    return { ok: false, error: `The result does not match the schema: ${first ? `${first.path.join(".") || "root"}: ${first.message}` : "unknown problem"}.` };
  }
  return { ok: true, value: r.data };
}

/** Reads an AI research result locally. Nothing is fetched, stored or sent. Content is untrusted data. */
export function ResultReader({ names = {} }: { names?: Readonly<Record<string, string>> }) {
  const [raw, setRaw] = useState("");
  const parsed = useMemo(() => (raw.trim() ? readResearchResult(raw) : null), [raw]);
  return (
    <section aria-labelledby="reader-h" className="border-t border-ink pt-3">
      <h2 id="reader-h" className="text-md font-semibold">
        Read an AI research result
      </h2>
      <p className="mt-1 max-w-[860px] text-sm text-ink-2">
        Paste the structured JSON your assistant returned. Each finding is shown with the label “AI interpretation” and its cited sources. Findings pass the neutral-language filter first. Text is shown only with a cited source that the assistant lists as examined. Nothing is sent or saved, and the pasted content is treated as data, never as instructions.
      </p>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={6}
        spellCheck={false}
        aria-label="AI research result JSON"
        className="mt-2 w-full border border-rule-2 bg-transparent p-2 font-mono text-xs"
      />
      {parsed && !parsed.ok && (
        <p role="alert" className="mt-2 text-xs text-st-contradicted">
          {parsed.error}
        </p>
      )}
      {parsed?.ok && <ResultView r={parsed.value} names={names} />}
    </section>
  );
}

/** `names` maps dataset initiative ids to dataset titles. Names inside the pasted JSON are never shown. */
export function ResultView({ r, names }: { r: ResearchOutput; names: Readonly<Record<string, string>> }) {
  const prov: AiProvenance = {
    model: r.provenance.model,
    promptVersion: r.provenance.promptVersion,
    sourcesExamined: r.provenance.sourcesExamined.length,
    verificationStatus: r.provenance.verificationStatus,
  };
  return (
    <div className="mt-3 space-y-6">
      {r.initiatives.length === 0 && <NotYetResearched />}
      {r.initiatives.map((ini) => (
        <div key={ini.id}>
          <h3 className="text-sm font-semibold">{names[ini.id] ?? "Initiative not found in the ballot dataset"}</h3>
          {ini.findings.length === 0 && <NotYetResearched className="mt-2" />}
          <ul className="mt-2 divide-y divide-rule border-y border-rule">
            {ini.findings.map((f, i) => {
              // Only sources the assistant reports examining count as citations. The schema has one URL list per finding, so each text shares it.
              const citations = examinedCitations(f.sourceUrls, r.provenance.sourcesExamined);
              // The kind label is the assistant's classification, so it is shown only together with displayable text.
              const shown = prepareAiInterpretation({ text: f.statement, citations, provenance: prov }).state === "shown";
              return (
                <li key={i} className="space-y-2 py-3" data-finding-kind={f.kind}>
                  {shown && <p className="text-2xs text-ink-3 uppercase">Assistant classification: {KIND_LABEL[f.kind]}</p>}
                  <AiInterpretation text={f.statement} citations={citations} provenance={prov} />
                  {f.counterargument && <AiInterpretation text={f.counterargument} citations={citations} provenance={prov} />}
                  {f.uncertainty && <AiInterpretation text={`Uncertainty: ${f.uncertainty}`} citations={citations} provenance={prov} />}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {r.injectionAttempts.length > 0 && (
        <div data-injection-attempts>
          <p className="eyebrow mb-1">Instructions found in retrieved content (shown as data, not followed)</p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-ink-2">
            {r.injectionAttempts.map((a, i) => (
              <li key={i}>
                <code className="font-mono">{a.excerpt}</code> <span className="text-ink-3">from {a.sourceUrl}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
