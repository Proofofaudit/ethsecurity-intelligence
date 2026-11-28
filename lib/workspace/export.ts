/**
 * Review-progress exports (Item 13): Markdown, CSV and JSON. Pure functions over the private
 * workspace and a context built on the server from the published dataset. Each format carries the
 * dataset timestamp, source URLs, open questions with asked/resolved marks and evidence links.
 * The JSON file embeds the whole workspace, so parseImport (zod) restores it exactly.
 */
import { exportWorkspace, type Workspace } from "@/components/workspace/schema";
import { PROGRESS_LABEL, type ProgressState } from "./progress";

export interface ExportContext {
  datasetVersion: string;
  /** Timestamp of the published dataset the exported record was read from. */
  dataAsOf: string;
  initiatives: { id: string; slug: string; label: string; url: string }[];
  sourceUrls: string[];
  openQuestions: { id: string; initiativeId: string; category: string; text: string; sourceUrl: string }[];
  evidenceLinks: { initiativeId: string; section: string; label: string; url: string; sourceName: string; checkedAt: string }[];
}

export const stateOf = (w: Workspace, id: string): ProgressState => w.progress[id]?.state ?? (w.initiatives.find((x) => x.id === id)?.reviewedAt ? "reviewed" : "not_started");

/** Initiatives that appear in an export: any with a state, a save, a note, a question or a marked open question. */
export function relevantIds(w: Workspace, ctx: ExportContext): string[] {
  const ids = new Set<string>();
  for (const i of w.initiatives) ids.add(i.id);
  for (const id of Object.keys(w.progress)) ids.add(id);
  for (const n of w.notes) if (n.initiativeId) ids.add(n.initiativeId);
  for (const q of w.questions) if (q.initiativeId) ids.add(q.initiativeId);
  for (const q of ctx.openQuestions) if (w.openQuestions[q.id]) ids.add(q.initiativeId);
  return ctx.initiatives.filter((i) => ids.has(i.id)).map((i) => i.id);
}

/** CSV cell: quotes doubled, and a leading = + - @ (or tab/CR) neutralized so spreadsheets do not run it as a formula. */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const md = (s: string) => s.replace(/\r?\n+/g, " ").replace(/([\\`*_{}[\]<>|])/g, "\\$1");
const day = (iso: string) => iso.slice(0, 10);

function oqMark(w: Workspace, id: string) {
  const m = w.openQuestions[id];
  return m ? `asked or resolved ${day(m.markedAt)}` : "not marked";
}

export function workspaceToMarkdown(w: Workspace, ctx: ExportContext, now = new Date()): string {
  const byId = new Map(ctx.initiatives.map((i) => [i.id, i]));
  const ids = relevantIds(w, ctx);
  const total = ctx.initiatives.length;
  const reviewed = ctx.initiatives.filter((i) => stateOf(w, i.id) === "reviewed").length;
  const L: string[] = [];
  L.push("# Review progress", "");
  L.push(`Exported ${now.toISOString()}. Dataset ${ctx.datasetVersion}, published ${ctx.dataAsOf}.`, "");
  L.push("Private reviewer workspace. Created in a browser and never sent to the server. Research only; not a recommendation.", "");
  L.push(`You've reviewed ${reviewed} of ${total}.`, "");
  L.push("## Source URLs", "");
  for (const u of ctx.sourceUrls) L.push(`- ${u}`);
  L.push("", "## Initiatives", "");
  if (!ids.length) L.push("No initiatives have a review state, note or saved mark yet.", "");
  for (const id of ids) {
    const ini = byId.get(id);
    if (!ini) continue;
    const mark = w.progress[id];
    const saved = w.initiatives.some((x) => x.id === id);
    L.push(`### ${md(ini.label)}`, "");
    L.push(`- State: ${PROGRESS_LABEL[stateOf(w, id)]}${mark ? ` (${day(mark.at)})` : ""}`);
    if (mark?.reason) L.push(`- Reason: ${md(mark.reason)}`);
    L.push(`- Saved for later: ${saved ? "yes" : "no"}`);
    L.push(`- Source: ${ini.url}`);
    const notes = w.notes.filter((n) => n.initiativeId === id);
    if (notes.length) {
      L.push("- Notes:");
      for (const n of notes) L.push(`  - ${day(n.updatedAt)}: ${md(n.text)}`);
    }
    const qs = w.questions.filter((q) => q.initiativeId === id);
    if (qs.length) {
      L.push("- Questions:");
      for (const q of qs) L.push(`  - ${md(q.text)} (${q.resolvedAt ? `resolved ${day(q.resolvedAt)}` : "open"})`);
    }
    const oq = ctx.openQuestions.filter((q) => q.initiativeId === id);
    if (oq.length) {
      L.push("- Open questions:");
      for (const q of oq) L.push(`  - [${q.id}] ${q.category}: ${md(q.text)} (${oqMark(w, q.id)}) ${q.sourceUrl}`);
    }
    const ev = ctx.evidenceLinks.filter((e) => e.initiativeId === id);
    if (ev.length) {
      L.push("- Evidence links:");
      for (const e of ev) L.push(`  - ${md(e.section)}, ${md(e.label)}: ${e.url} (${md(e.sourceName)}, checked ${day(e.checkedAt)})`);
    }
    L.push("");
  }
  const general = w.notes.filter((n) => !n.initiativeId);
  const generalQs = w.questions.filter((q) => !q.initiativeId);
  if (general.length || generalQs.length) {
    L.push("## General", "");
    for (const n of general) L.push(`- Note ${day(n.updatedAt)}: ${md(n.text)}`);
    for (const q of generalQs) L.push(`- Question: ${md(q.text)} (${q.resolvedAt ? `resolved ${day(q.resolvedAt)}` : "open"})`);
    L.push("");
  }
  return L.join("\n");
}

export function workspaceToCsv(w: Workspace, ctx: ExportContext): string {
  const byId = new Map(ctx.initiatives.map((i) => [i.id, i]));
  const rows: (string | number | null)[][] = [["dataset_version", "data_as_of", "record", "initiative", "initiative_id", "state_or_mark", "text", "date", "url"]];
  const row = (record: string, id: string | null, mark: string, text: string, date: string, url: string) =>
    rows.push([ctx.datasetVersion, ctx.dataAsOf, record, id ? (byId.get(id)?.label ?? "") : "General", id ?? "", mark, text, date, url]);
  for (const u of ctx.sourceUrls) row("source_url", null, "", "", "", u);
  for (const id of relevantIds(w, ctx)) {
    const ini = byId.get(id);
    if (!ini) continue;
    const mark = w.progress[id];
    row("progress", id, PROGRESS_LABEL[stateOf(w, id)], mark?.reason ?? "", mark?.at ?? "", ini.url);
    row("saved_for_later", id, w.initiatives.some((x) => x.id === id) ? "yes" : "no", "", "", "");
    for (const n of w.notes.filter((x) => x.initiativeId === id)) row("note", id, "", n.text, n.updatedAt, "");
    for (const q of w.questions.filter((x) => x.initiativeId === id)) row("question", id, q.resolvedAt ? "resolved" : "open", q.text, q.resolvedAt ?? q.createdAt, "");
    for (const q of ctx.openQuestions.filter((x) => x.initiativeId === id)) row("open_question", id, w.openQuestions[q.id] ? "asked_or_resolved" : "not_marked", `[${q.id}] ${q.category}: ${q.text}`, w.openQuestions[q.id]?.markedAt ?? "", q.sourceUrl);
    for (const e of ctx.evidenceLinks.filter((x) => x.initiativeId === id)) row("evidence_link", id, e.section, `${e.label} (${e.sourceName})`, e.checkedAt, e.url);
  }
  for (const n of w.notes.filter((x) => !x.initiativeId)) row("note", null, "", n.text, n.updatedAt, "");
  for (const q of w.questions.filter((x) => !x.initiativeId)) row("question", null, q.resolvedAt ? "resolved" : "open", q.text, q.resolvedAt ?? q.createdAt, "");
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Export file with the whole workspace under `workspace`, plus the dataset context it was written against. */
export function workspaceToJson(w: Workspace, ctx: ExportContext, now = new Date()): string {
  const body = exportWorkspace(w, now);
  return JSON.stringify(
    {
      ...body,
      dataset: { datasetVersion: ctx.datasetVersion, dataAsOf: ctx.dataAsOf },
      sourceUrls: ctx.sourceUrls,
      openQuestions: ctx.openQuestions.filter((q) => w.openQuestions[q.id] || relevantIds(w, ctx).includes(q.initiativeId)).map((q) => ({ ...q, mark: w.openQuestions[q.id] ? "asked_or_resolved" : "not_marked", markedAt: w.openQuestions[q.id]?.markedAt ?? null })),
      evidenceLinks: ctx.evidenceLinks.filter((e) => relevantIds(w, ctx).includes(e.initiativeId)),
    },
    null,
    2,
  );
}
