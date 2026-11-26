"use client";

import { useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { AddPicker, Check, inputClass, Segmented, textareaClass } from "@/components/ui/form";
import { cn } from "@/lib/util/cn";
import {
  APPLICANT_LABEL,
  buildConfigJson,
  buildPrompt,
  buildSkill,
  COUNTER_LABEL,
  DEPTH_LABEL,
  MODES,
  modeConfig,
  OUTPUT_LABEL,
  scopeOf,
  SOURCES_LABEL,
  SUPPORT_LABEL,
  UNCERTAINTY_LABEL,
  validateConfig,
  type LabConfig,
  type Perspective,
  type SkillContext,
} from "@/lib/skills";
import { CopyButton, copyText, download } from "./copy";
import { McpPanel } from "./mcp-panel";
import { deleteTemplate, saveTemplate, useTemplates } from "./templates";

type Tab = "prompt" | "skill" | "json";

const noop = () => () => undefined;

/** The site origin the page is served from, so connection details always point at this deployment. */
function useOrigin(fallback: string) {
  return useSyncExternalStore(noop, () => window.location.origin, () => fallback);
}

function Fieldset({ n, title, note, children }: { n: number; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="border-t border-rule pt-4 first:border-ink">
      <legend className="float-left mb-3 flex w-full items-baseline gap-3">
        <span className="num w-6 shrink-0 text-xs text-ink-3">{String(n).padStart(2, "0")}</span>
        <span className="text-md font-semibold">{title}</span>
      </legend>
      <div className="clear-both space-y-4 pl-9 max-sm:pl-0">
        {note && <p className="text-xs text-ink-3">{note}</p>}
        {children}
      </div>
    </fieldset>
  );
}

function Label({ text, hint, children, htmlFor }: { text: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 flex items-baseline justify-between gap-3 text-xs text-ink-3">
        <span>{text}</span>
        {hint && <span className="num text-ink">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Radios<T extends string>({ name, value, options, onChange, label }: { name: string; value: T; options: Record<T, string>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="space-y-1">
      <p className="text-xs text-ink-3">{label}</p>
      {(Object.keys(options) as T[]).map((k) => (
        <label key={k} className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="radio" name={name} className="mt-[3px] size-3.5 shrink-0 accent-[var(--accent)]" checked={value === k} onChange={() => onChange(k)} />
          <span>{options[k]}</span>
        </label>
      ))}
    </div>
  );
}

function NumberField({ label, value, onChange, min, max, step, placeholder, suffix }: { label: string; value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; placeholder?: string; suffix?: string }) {
  const id = useId();
  return (
    <Label text={label} htmlFor={id}>
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className={inputClass}
          value={value ?? ""}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
        {suffix && <span className="shrink-0 text-xs text-ink-3">{suffix}</span>}
      </div>
    </Label>
  );
}

function Chips({ items, onRemove, empty }: { items: { id: string; label: string }[]; onRemove: (id: string) => void; empty: string }) {
  if (!items.length) return <p className="mt-1.5 text-xs text-ink-3">{empty}</p>;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {items.map((x) => (
        <li key={x.id} className="inline-flex max-w-full items-center gap-1 rounded-xs border border-rule-2 py-px pr-1 pl-1.5 text-xs">
          <span className="truncate">{x.label}</span>
          <button type="button" onClick={() => onRemove(x.id)} className="px-0.5 text-ink-3 hover:text-accent" aria-label={`Remove ${x.label}`}>
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

const toggle = <T,>(list: T[], v: T, on: boolean) => (on ? [...list.filter((x) => x !== v), v] : list.filter((x) => x !== v));

export function LabConfigurator({ ctx: serverCtx }: { ctx: SkillContext }) {
  const origin = useOrigin(serverCtx.siteUrl);
  const ctx = useMemo(() => ({ ...serverCtx, siteUrl: origin }), [serverCtx, origin]);
  const [config, setConfig] = useState<LabConfig>(() => modeConfig(MODES[0]!.id));
  const [questions, setQuestions] = useState(() => config.focusQuestions.join("\n"));
  const [tab, setTab] = useState<Tab>("prompt");
  const [notice, setNotice] = useState<string | null>(null);
  const templates = useTemplates();

  const set = <K extends keyof LabConfig>(k: K, v: LabConfig[K]) => setConfig((c) => ({ ...c, [k]: v }));
  const setFunding = <K extends keyof LabConfig["funding"]>(k: K, v: LabConfig["funding"][K]) => setConfig((c) => ({ ...c, funding: { ...c.funding, [k]: v } }));
  const setEvidence = <K extends keyof LabConfig["evidence"]>(k: K, v: LabConfig["evidence"][K]) => setConfig((c) => ({ ...c, evidence: { ...c.evidence, [k]: v } }));

  const applyConfig = (c: LabConfig) => {
    setConfig(c);
    setQuestions(c.focusQuestions.join("\n"));
  };
  const pickMode = (id: Perspective) => applyConfig(modeConfig(id));

  const validation = useMemo(() => validateConfig(config, ctx), [config, ctx]);
  const out = useMemo(() => {
    if (!validation.ok) return null;
    const skill = buildSkill(validation.config, ctx);
    return { skill, prompt: buildPrompt(validation.config, ctx), json: JSON.stringify(buildConfigJson(validation.config, ctx), null, 2), scope: scopeOf(validation.config, ctx) };
  }, [validation, ctx]);

  const preview = out ? (tab === "prompt" ? out.prompt : tab === "skill" ? out.skill.markdown : out.json) : "";
  const exportHref = out ? (out.scope.length === ctx.cohortSize ? "/api/v1/export" : `/api/v1/export?ids=${out.scope.map((i) => i.slug).join(",")}`) : null;
  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2500);
  };

  const byInitiative = new Map(ctx.initiatives.flatMap((i) => [[i.id, i] as const, [i.slug, i] as const]));
  const byOrg = new Map(ctx.organizations.map((o) => [o.id, o]));
  const weightIssues = validation.ok ? [] : validation.issues;

  return (
    <div className="space-y-12">
      <section aria-labelledby="modes-h">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="modes-h" className="text-md font-semibold">
            Research mode
          </h2>
          <p className="text-xs text-ink-3">A mode fills in every setting below. Change any of them afterwards. No mode sets metric weights.</p>
        </div>
        <div role="radiogroup" aria-labelledby="modes-h" className="grid border-t border-ink sm:grid-cols-2 xl:grid-cols-4">
          {MODES.map((m) => {
            const on = config.perspective === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pickMode(m.id)}
                className={cn("group relative flex flex-col items-stretch justify-start border-b border-rule px-3 py-3 text-left transition-colors sm:border-r sm:[&:nth-child(2n)]:border-r-0 xl:[&:nth-child(2n)]:border-r xl:[&:nth-child(4n)]:border-r-0", on ? "bg-paper-2" : "hover:bg-paper-2/60")}
              >
                <span aria-hidden="true" className={cn("absolute top-0 bottom-0 left-0 w-0.5", on ? "bg-accent" : "bg-transparent")} />
                <span className="flex items-baseline gap-2">
                  <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 translate-y-[-1px] rounded-full border", on ? "border-accent bg-accent" : "border-ink-3")} />
                  <span className="text-sm font-medium">{m.label}</span>
                </span>
                <span className="mt-1 block pl-4 text-xs leading-[18px] text-ink-3">{m.summary}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] [&>*]:min-w-0">
        <form className="space-y-8" onSubmit={(e) => e.preventDefault()} aria-label="Research configuration">
          <Fieldset n={1} title="Perspective and questions">
            <Label text="Brief name (also the skill name)" htmlFor="lab-name">
              <input id="lab-name" className={inputClass} value={config.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />
            </Label>
            <Label text="Research perspective" htmlFor="lab-perspective">
              <select id="lab-perspective" className={inputClass} value={config.perspective} onChange={(e) => set("perspective", e.target.value as Perspective)}>
                {MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Focus questions, one per line (up to 10)" htmlFor="lab-questions">
              <textarea
                id="lab-questions"
                rows={5}
                className={textareaClass}
                value={questions}
                onChange={(e) => {
                  setQuestions(e.target.value);
                  set(
                    "focusQuestions",
                    e.target.value
                      .split("\n")
                      .map((q) => q.trim())
                      .filter(Boolean),
                  );
                }}
              />
            </Label>
          </Fieldset>

          <Fieldset n={2} title="Scope" note={`Every brief is limited to the ${ctx.cohortSize} initiatives in the ballot cohort. Narrow it further here; empty means no restriction.`}>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <Check checked={config.initiativeTypes.includes("grant")} onChange={(on) => set("initiativeTypes", toggle(config.initiativeTypes, "grant", on))}>
                Grants
              </Check>
              <Check checked={config.initiativeTypes.includes("rfp")} onChange={(on) => set("initiativeTypes", toggle(config.initiativeTypes, "rfp", on))}>
                RFPs
              </Check>
            </div>
            <div>
              <p className="mb-1 text-xs text-ink-3">Official categories (any of)</p>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {ctx.categories.map((c) => (
                  <Check key={c.slug} checked={config.categories.includes(c.slug)} onChange={(on) => set("categories", toggle(config.categories, c.slug, on))}>
                    {c.label} <span className="num text-xs text-ink-3">{c.count}</span>
                  </Check>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs text-ink-3">Security lifecycle stages, rule-based tags (any of)</p>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {ctx.stages.map((s) => (
                  <Check key={s.id} checked={config.stages.includes(s.id)} onChange={(on) => set("stages", toggle(config.stages, s.id, on))}>
                    <span title={s.description}>{s.label}</span>
                  </Check>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs text-ink-3">Recipient organizations</p>
              <AddPicker
                options={ctx.organizations.map((o) => ({ id: o.id, label: o.name, sub: `${o.initiatives} ${o.initiatives === 1 ? "initiative" : "initiatives"}` }))}
                selected={config.organizations}
                max={100}
                onAdd={(id) => set("organizations", [...config.organizations, id])}
                placeholder="Add an organization by name"
                label="Add a recipient organization"
              />
              <Chips items={config.organizations.map((id) => ({ id, label: byOrg.get(id)?.name ?? id }))} onRemove={(id) => set("organizations", config.organizations.filter((x) => x !== id))} empty="Every organization." />
            </div>
            <div>
              <p className="mb-1 text-xs text-ink-3">Specific initiatives</p>
              <AddPicker
                options={ctx.initiatives.map((i) => ({ id: i.slug, label: i.name, sub: i.type === "rfp" ? "RFP" : i.organization }))}
                selected={config.initiatives}
                max={55}
                onAdd={(id) => set("initiatives", [...config.initiatives, id])}
                placeholder="Add an initiative by name"
                label="Add an initiative to the brief"
              />
              <Chips items={config.initiatives.map((id) => ({ id, label: byInitiative.get(id)?.name ?? id }))} onRemove={(id) => set("initiatives", config.initiatives.filter((x) => x !== id))} empty="Every initiative that matches the filters." />
            </div>
          </Fieldset>

          <Fieldset n={3} title="Funding parameters" note="Goal and funded-share ranges filter the scope. Pledge conversion, adoption and budget are passed to the what-if tool; they change no official figure.">
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField label="Goal at least" suffix="USD" min={0} step={1000} value={config.funding.goalMinUsd} onChange={(v) => setFunding("goalMinUsd", v)} />
              <NumberField label="Goal at most" suffix="USD" min={0} step={1000} value={config.funding.goalMaxUsd} onChange={(v) => setFunding("goalMaxUsd", v)} />
              <NumberField label="Funded share at least" suffix="%" min={0} max={100} value={config.funding.fundedMinPct} onChange={(v) => setFunding("fundedMinPct", v)} />
              <NumberField label="Funded share at most" suffix="%" min={0} max={100} value={config.funding.fundedMaxPct} onChange={(v) => setFunding("fundedMaxPct", v)} />
            </div>
            <Label text="Outstanding pledges that convert to funds" hint={`${config.funding.pledgeConversionPct}%`}>
              <input type="range" min={0} max={100} step={5} value={config.funding.pledgeConversionPct} onChange={(e) => setFunding("pledgeConversionPct", Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label="Pledge conversion percentage" />
            </Label>
            <Check checked={config.funding.excludeAdoptionMilestones} onChange={(v) => setFunding("excludeAdoptionMilestones", v)}>
              Exclude open adoption milestones from scope
            </Check>
            <NumberField label="Budget to apply to gaps (optional)" suffix="USD" min={0} step={1000} value={config.funding.budgetUsd} onChange={(v) => setFunding("budgetUsd", v)} />
          </Fieldset>

          <Fieldset n={4} title="Time, depth and results">
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField label="Available research time" suffix="minutes" min={5} max={480} step={5} value={config.researchMinutes} onChange={(v) => set("researchMinutes", v ?? 0)} />
              <NumberField label="Initiatives covered in detail" min={1} max={55} value={config.results} onChange={(v) => set("results", v ?? 0)} />
            </div>
            <Radios name="depth" label="Technical depth" value={config.depth} options={DEPTH_LABEL} onChange={(v) => set("depth", v)} />
          </Fieldset>

          <Fieldset n={5} title="Evaluation metrics and weights" note="Choose the metrics the assistant reports. Weights are optional and entirely yours: leave them empty to report each metric separately. The brief forbids turning them into a ranking.">
            <ul className="divide-y divide-rule border-y border-rule">
              {ctx.metrics.map((m) => {
                const on = config.metrics.includes(m.id);
                const w = config.weights[m.id];
                return (
                  <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_80px] items-start gap-3 py-2">
                    <Check
                      checked={on}
                      onChange={(v) =>
                        setConfig((c) => {
                          const weights = { ...c.weights };
                          if (!v) delete weights[m.id];
                          return { ...c, metrics: toggle(c.metrics, m.id, v), weights };
                        })
                      }
                    >
                      <span className="block">{m.name}</span>
                      <span className="block text-xs text-ink-3">{m.description}</span>
                    </Check>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={1}
                      disabled={!on}
                      placeholder="None"
                      aria-label={`Weight for ${m.name}, 0 to 10`}
                      className={cn(inputClass, "text-right")}
                      value={w ?? ""}
                      onChange={(e) =>
                        setConfig((c) => {
                          const weights = { ...c.weights };
                          if (e.target.value === "") delete weights[m.id];
                          else weights[m.id] = Number(e.target.value);
                          return { ...c, weights };
                        })
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </Fieldset>

          <Fieldset n={6} title="Evidence requirements" note="Source citations are always required.">
            <div>
              <p className="mb-1 text-xs text-ink-3">A claim counts as established with</p>
              <Segmented
                label="Evidence needed to treat a claim as established"
                value={config.evidence.establishedAt}
                onChange={(v) => setEvidence("establishedAt", v)}
                options={(Object.keys(SUPPORT_LABEL) as (keyof typeof SUPPORT_LABEL)[]).map((k) => ({ value: k, label: k === "independently_verified" ? "Independent verification only" : "Verified or partially supported" }))}
              />
              <p className="mt-1 text-xs text-ink-3">{SUPPORT_LABEL[config.evidence.establishedAt]}.</p>
            </div>
            <Radios name="applicant" label="Applicant statements" value={config.evidence.applicantStatements} options={APPLICANT_LABEL} onChange={(v) => setEvidence("applicantStatements", v)} />
            <Radios name="sources" label="Sources the assistant may use" value={config.evidence.sources} options={SOURCES_LABEL} onChange={(v) => setEvidence("sources", v)} />
            <Check checked={config.evidence.citeClaimIds} onChange={(v) => setEvidence("citeClaimIds", v)}>
              Also cite claim, evidence and milestone ids
            </Check>
          </Fieldset>

          <Fieldset n={7} title="Output, counterarguments and uncertainty">
            <Radios name="format" label="Output format" value={config.outputFormat} options={OUTPUT_LABEL} onChange={(v) => set("outputFormat", v)} />
            <Radios name="counter" label="Counterarguments" value={config.counterarguments} options={COUNTER_LABEL} onChange={(v) => set("counterarguments", v)} />
            <Radios name="uncertainty" label="Uncertainty" value={config.uncertainty} options={UNCERTAINTY_LABEL} onChange={(v) => set("uncertainty", v)} />
            <Check checked={config.allowInference} onChange={(v) => set("allowInference", v)}>
              Allow labeled inferences beyond the records
            </Check>
          </Fieldset>
        </form>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="border-t border-ink pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-md font-semibold">Generated brief</h2>
              <p className="num text-xs text-ink-3" aria-live="polite">
                {out ? `${out.scope.length} of ${ctx.cohortSize} initiatives match · ${Math.min(config.results, out.scope.length)} in detail` : "Fix the settings below"}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={!out}
                onClick={async () => {
                  if (out) flash((await copyText(out.prompt)) ? "Prompt copied to the clipboard." : "Copying failed. Select the text and copy it manually.");
                }}
              >
                Copy prompt
              </Button>
              <Button
                size="sm"
                disabled={!out}
                onClick={() => {
                  if (!out) return;
                  download("SKILL.md", out.skill.markdown, "text/markdown;charset=utf-8");
                  flash(`Downloaded SKILL.md. Save it in a folder named ${out.skill.name}.`);
                }}
              >
                Download SKILL.md
              </Button>
              <Button
                size="sm"
                disabled={!out}
                onClick={() => {
                  if (!out) return;
                  download(`${out.skill.name}.config.json`, `${out.json}\n`, "application/json");
                  flash("Downloaded the JSON configuration.");
                }}
              >
                Download JSON configuration
              </Button>
              {exportHref && out && out.scope.length > 0 ? (
                <a href={exportHref} download className={buttonClass("default", "sm")}>
                  Export evidence bundle
                </a>
              ) : (
                <Button size="sm" disabled>
                  Export evidence bundle
                </Button>
              )}
            </div>
            <p className="mt-2 min-h-[18px] text-xs text-ink-2" role="status">
              {notice ?? (out ? `The evidence bundle covers the ${out.scope.length} matching ${out.scope.length === 1 ? "initiative" : "initiatives"}.` : "")}
            </p>

            {!validation.ok && (
              <div role="alert" className="mt-2 border-l-2 border-st-contradicted pl-3 text-sm">
                <p className="font-medium text-st-contradicted">These settings cannot produce a brief yet:</p>
                <ul className="mt-1 list-disc pl-5 text-ink-2">
                  {weightIssues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-3">
              <Segmented
                label="Preview"
                value={tab}
                onChange={setTab}
                options={[
                  { value: "prompt", label: "Prompt" },
                  { value: "skill", label: "SKILL.md" },
                  { value: "json", label: "JSON" },
                ]}
              />
              {out && <CopyButton text={preview} label="Copy this view" variant="ghost" />}
            </div>
            <pre
              tabIndex={0}
              aria-label={`${tab === "prompt" ? "Prompt" : tab === "skill" ? "SKILL.md" : "JSON configuration"} preview`}
              className="mt-2 max-h-[min(72vh,900px)] overflow-auto rounded-xs border border-rule bg-paper-2 p-4 font-mono text-[12px] leading-[19px] whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere] focus:border-ink focus:outline-none"
            >
              {out ? preview : "No preview while the settings are invalid."}
            </pre>
            {out && (
              <p className="num mt-1.5 text-2xs text-ink-3">
                {preview.split("\n").length} lines · {preview.length.toLocaleString("en-US")} characters · dataset {ctx.datasetVersion}
              </p>
            )}
          </div>
        </div>
      </div>

      <Templates config={config} onLoad={applyConfig} templates={templates} />

      <McpPanel siteUrl={ctx.siteUrl} />
    </div>
  );
}

function Templates({ config, onLoad, templates }: { config: LabConfig; onLoad: (c: LabConfig) => void; templates: ReturnType<typeof useTemplates> }) {
  const [msg, setMsg] = useState<string | null>(null);
  const exists = templates.some((t) => t.config.name === config.name);
  return (
    <section aria-labelledby="tpl-h" className="border-t border-ink pt-3">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tpl-h" className="text-md font-semibold">
          Reusable templates
        </h2>
        <p className="text-xs text-ink-3">Saved in this browser only. Nothing is sent to the server.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          onClick={() => {
            saveTemplate(config);
            setMsg(exists ? `Updated “${config.name}”.` : `Saved “${config.name}”.`);
          }}
        >
          {exists ? "Update template" : "Save as template"}
        </Button>
        <span className="text-xs text-ink-3" role="status">
          {msg ?? `Saves the current settings under the brief name “${config.name}”.`}
        </span>
      </div>
      {templates.length > 0 ? (
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{t.config.name}</span>
              <span className="text-xs text-ink-3">{MODES.find((m) => m.id === t.config.perspective)?.label}</span>
              <span className="num text-xs text-ink-3">{t.savedAt.slice(0, 16).replace("T", " ")} UTC</span>
              <button type="button" className="text-xs text-ink-2 hover:text-accent" onClick={() => onLoad(t.config)}>
                Load
              </button>
              <button type="button" className="text-xs text-ink-3 hover:text-accent" onClick={() => deleteTemplate(t.id)} aria-label={`Delete template ${t.config.name}`}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-ink-3">No saved templates yet.</p>
      )}
    </section>
  );
}
