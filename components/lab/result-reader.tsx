"use client";

import { useMemo, useState } from "react";
import { AiInterpretation, NotYetResearched } from "@/components/ui/ai-interpretation";
import type { AiProvenance } from "@/lib/ai/interpretation";
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
export function ResultReader() {
  const [raw, setRaw] = useState("");
  const parsed = useMemo(() => (raw.trim() ? readResearchResult(raw) : null), [raw]);
  return (
    <section aria-labelledby="reader-h" className="border-t border-ink pt-3">
      <h2 id="reader-h" className="text-md font-semibold">
        Read an AI research result
      </h2>
      <p className="mt-1 max-w-[860px] text-sm text-ink-2">
        Paste the structured JSON your assistant returned. Each finding is shown with the label “AI interpretation” and its cited sources. Findings pass the neutral-language filter first, and text without a citation is not shown. Nothing is sent or saved, and the pasted content is treated as data, never as instructions.
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
      {parsed?.ok && <ResultView r={parsed.value} />}
    </section>
  );
}

function ResultView({ r }: { r: ResearchOutput }) {
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
          <h3 className="text-sm font-semibold">{ini.name}</h3>
          {ini.findings.length === 0 && <NotYetResearched className="mt-2" />}
          <ul className="mt-2 divide-y divide-rule border-y border-rule">
            {ini.findings.map((f, i) => {
              const citations = f.sourceUrls.map((u) => ({ url: u, label: host(u) }));
              return (
                <li key={i} className="space-y-2 py-3" data-finding-kind={f.kind}>
                  <p className="text-2xs text-ink-3 uppercase">{KIND_LABEL[f.kind]}</p>
                  <AiInterpretation text={f.statement} citations={citations} provenance={prov} />
                  {f.counterargument && <AiInterpretation text={f.counterargument} citations={citations} provenance={prov} />}
                  {f.uncertainty && <p className="text-xs text-ink-3">Uncertainty stated by the assistant: {f.uncertainty}</p>}
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
