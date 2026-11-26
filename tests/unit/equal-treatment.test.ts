/**
 * Equal treatment of Proof of Audits, whose owner also publishes this site.
 *
 * (a) A static scan fails if ranking, sorting, filtering, scoring or display code refers to
 *     Proof of Audits by name, slug or id outside a short, enumerated list of disclosure uses.
 * (b) The Proof of Audits dossier has the same sections, evidence rules and correction link as
 *     every other initiative in the cohort.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { SubmissionSchema } from "@/lib/corrections";
import { COI_ORGANIZATION_ID, isCoiOrganization } from "@/lib/disclosure";
import type { Claim, Dataset, EvidenceStatus } from "@/lib/domain/schemas";
import { dossier, findInitiative, type Dossier } from "@/lib/intelligence/service";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SCAN_DIRS = ["app", "components", "lib", "mcp", "research", "scripts"];

/** Human name, slug and organization id in any spelling ("Proof of Audits", "proof-of-audits", "org_proof-of-audits"). */
const NAME = /proof[\s_-]*of[\s_-]*audits?/gi;
/** Identifiers that select the Proof of Audits organization. */
const IDENT = /\b(?:COI_ORGANIZATION_ID|isCoiOrganization)\b/g;
/** The GitHub organization in repository URLs is not a reference to the initiative. */
const REPO_ORG = /github\.com\/Proofofaudit\b/gi;
/** Words that indicate ordering, scoring or emphasis. Never allowed on a line that selects Proof of Audits. */
const TREATMENT = /\.sort\(|\bsort|\brank|\bscor(?:e|ing)|\bweight|\bboost|\bpriorit|\border(?:ed|ing)?\b|\bpin(?:ned)?\b|\bfeatured?\b|\bhighlight/i;
/** Modules that compute, order or filter research results may never mention Proof of Audits at all. */
const ENGINE = [/^lib\/intelligence\//, /^lib\/metrics\//, /^lib\/api\//, /^lib\/db\//, /^lib\/corrections\//, /^research\//, /^components\/research\//, /^components\/ui\//, /^components\/graph\//, /^app\/api\//];

/**
 * Every allowed reference, by file, with the exact number of matches. Adding a reference
 * anywhere fails this test until it is reviewed and listed here with its reason.
 */
const ALLOWED: Record<string, { name: number; ident: number; reason: string }> = {
  "lib/disclosure.ts": { name: 5, ident: 3, reason: "Disclosure texts, the organization id and the isCoiOrganization helper" },
  "app/about/page.tsx": { name: 5, ident: 2, reason: "About and conflict-of-interest disclosure page" },
  "app/methodology/page.tsx": { name: 1, ident: 0, reason: "Neutrality rules state that the same rules apply to Proof of Audits" },
  "app/initiatives/[slug]/page.tsx": { name: 0, ident: 2, reason: "Disclosure note on the Proof of Audits dossier (import + condition)" },
  "app/entities/[type]/[id]/page.tsx": { name: 0, ident: 2, reason: "Disclosure note on the Proof of Audits organization profile (import + condition)" },
  "app/research/collaboration/page.tsx": { name: 0, ident: 2, reason: "Disclosure note when Proof of Audits pairs are listed (import + condition)" },
  "components/shell/nav.ts": { name: 1, ident: 0, reason: "Search keywords of the About and disclosure page" },
  "lib/skills/build.ts": { name: 2, ident: 0, reason: "Disclosure lines in generated research briefs" },
  "lib/skills/context.ts": { name: 0, ident: 2, reason: "Names the Proof of Audits initiative in the brief's disclosure" },
  "mcp/server.ts": { name: 1, ident: 3, reason: "Disclosure in MCP server instructions and on the organization profile" },
};

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...(await sourceFiles(rel)));
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(e.name)) out.push(rel);
  }
  return out;
}

interface Hit {
  file: string;
  line: number;
  text: string;
  kind: "name" | "ident";
}

async function scan(): Promise<Hit[]> {
  const hits: Hit[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of await sourceFiles(dir)) {
      const lines = (await fs.readFile(path.join(ROOT, file), "utf8")).split("\n");
      lines.forEach((raw, i) => {
        const text = raw.replace(REPO_ORG, "");
        for (const _ of text.matchAll(NAME)) hits.push({ file, line: i + 1, text: raw.trim(), kind: "name" });
        for (const _ of text.matchAll(IDENT)) hits.push({ file, line: i + 1, text: raw.trim(), kind: "ident" });
      });
    }
  }
  return hits;
}

describe("static scan: no special treatment of Proof of Audits in code", () => {
  let hits: Hit[];
  beforeAll(async () => {
    hits = await scan();
  });

  it("finds the disclosure references, so the scan itself works", () => {
    expect(hits.some((h) => h.file === "lib/disclosure.ts" && h.kind === "ident")).toBe(true);
    expect(hits.some((h) => h.file === "app/initiatives/[slug]/page.tsx")).toBe(true);
  });

  it("references Proof of Audits only in the enumerated disclosure uses, with exact counts", () => {
    const counts: Record<string, { name: number; ident: number }> = {};
    for (const h of hits) (counts[h.file] ??= { name: 0, ident: 0 })[h.kind]++;
    const unexpected = Object.keys(counts).filter((f) => !ALLOWED[f]);
    expect(unexpected, `unreviewed references:\n${hits.filter((h) => unexpected.includes(h.file)).map((h) => `${h.file}:${h.line} ${h.text}`).join("\n")}`).toEqual([]);
    for (const [file, allowed] of Object.entries(ALLOWED)) {
      expect(counts[file] ?? { name: 0, ident: 0 }, `${file}: ${allowed.reason}`).toEqual({ name: allowed.name, ident: allowed.ident });
    }
  });

  it("never mentions Proof of Audits in ranking, sorting, filtering, scoring, storage or API modules", () => {
    const inEngine = hits.filter((h) => ENGINE.some((re) => re.test(h.file)));
    expect(inEngine.map((h) => `${h.file}:${h.line}`)).toEqual([]);
  });

  it("never selects Proof of Audits on a line that orders, scores or emphasizes", () => {
    const selecting = hits.filter((h) => h.kind === "ident" || /proof-of-audits|org_proof/i.test(h.text));
    const bad = selecting.filter((h) => TREATMENT.test(h.text.replace(/\/\/.*$/, "")));
    expect(bad.map((h) => `${h.file}:${h.line} ${h.text}`)).toEqual([]);
  });

  it("the Proof of Audits organization id literal exists only in lib/disclosure.ts", () => {
    const literal = hits.filter((h) => h.text.includes(`"${COI_ORGANIZATION_ID}"`));
    expect([...new Set(literal.map((h) => h.file))]).toEqual(["lib/disclosure.ts"]);
  });

  it("uses the dossier disclosure only for a note that contains no section or correction control", async () => {
    const src = await fs.readFile(path.join(ROOT, "app/initiatives/[slug]/page.tsx"), "utf8");
    const start = src.indexOf("{isCoiOrganization(");
    expect(start).toBeGreaterThan(0);
    const block = src.slice(start, src.indexOf("</aside>", start));
    expect(block).toContain('aria-label="Conflict of interest"');
    expect(block).not.toMatch(/CorrectionButton|<Section|sectionIds|<Sections/);
    // The section list and the correction controls are unconditional and identical for every initiative.
    expect(src).toMatch(/const sectionIds = \[\s*"briefing",/);
    expect(src.match(/<CorrectionButton type="initiative" id=\{ini\.id\}/g)?.length).toBe(2);
    expect(src).toContain('<Link href="/corrections"');
  });
});

// ───────────────────────────── Dossier parity ─────────────────────────────

const SUPPORTED: EvidenceStatus[] = ["independently_verified", "partially_supported"];
/** Statuses an applicant statement can carry without machine-observed support. */
const APPLICANT_UNSUPPORTED: EvidenceStatus[] = ["applicant_reported", "future_target", "not_independently_verified", "disputed", "contradicted", "outdated"];

/** The evidence rules, applied to one claim. Returns the broken rules (empty when compliant). */
function evidenceRuleViolations(x: Dossier, c: Claim): string[] {
  const out: string[] = [];
  const ev = new Map(x.evidence.map((e) => [e.id, e]));
  for (const id of [...c.evidenceIds, ...c.supportingEvidenceIds, ...c.contradictingEvidenceIds]) if (!ev.has(id)) out.push(`cites evidence ${id} that the dossier does not list`);
  if (SUPPORTED.includes(c.status)) {
    const machine = c.supportingEvidenceIds.map((id) => ev.get(id)).filter((e) => e && e.kind !== "proposal_text");
    if (!machine.length) out.push(`${c.status} without machine-observed supporting evidence`);
  } else if (c.origin === "applicant" && !APPLICANT_UNSUPPORTED.includes(c.status)) {
    out.push(`applicant statement with status ${c.status}`);
  }
  if (c.origin === "applicant" && c.status === "officially_reported") out.push("applicant statement shown as official");
  if (!c.verificationMethod.trim()) out.push("no verification method");
  return out;
}

const shape = (x: Dossier) => ({ sections: Object.keys(x).sort(), reality: Object.keys(x.reality).sort(), metrics: Object.keys(x.metrics).sort() });

describe("Proof of Audits dossier parity with all 55 initiatives", () => {
  let d: Dataset;
  let all: Dossier[];
  let poa: Dossier[];
  beforeAll(async () => {
    d = await (await import("@/lib/db/file-store")).loadPublishedDataset();
    all = d.initiatives.map((i) => dossier(d, i.id)!);
    poa = all.filter((x) => isCoiOrganization(x.initiative.organizationId));
  });

  it("covers the whole cohort, including exactly one Proof of Audits initiative", () => {
    expect(all).toHaveLength(55);
    expect(all.every(Boolean)).toBe(true);
    expect(poa).toHaveLength(1);
    expect(poa[0]!.initiative.slug).toMatch(/^proof-of-audits-proof-before-sign-for-ethereum-wallets-and-a/);
  });

  it("uses the same dossier sections, reality columns and metrics as every other initiative", () => {
    const reference = shape(all.find((x) => !isCoiOrganization(x.initiative.organizationId))!);
    for (const x of all) expect(shape(x), x.initiative.slug).toEqual(reference);
  });

  it("applies the same evidence rules to every claim of every initiative", () => {
    const violations = all.flatMap((x) => x.claims.flatMap((c) => evidenceRuleViolations(x, c).map((v) => `${x.initiative.slug} ${c.id}: ${v}`)));
    expect(violations).toEqual([]);
    expect(poa[0]!.claims.length).toBeGreaterThan(0);
  });

  it("uses only verification methods that the pipeline also uses for other initiatives", () => {
    // Methods carry record details after the first separator ("…; last push 2026-11-14; license …").
    const method = (c: Claim) => c.verificationMethod.split(/[;:(]/)[0]!.replace(/\d[\d,.]*/g, "#").trim();
    const others = new Set(all.filter((x) => !poa.includes(x)).flatMap((x) => x.claims.map(method)));
    const own = [...new Set(poa[0]!.claims.map(method))];
    expect(own.filter((m) => !others.has(m))).toEqual([]);
  });

  it("ran the same research tasks as the rest of the cohort", () => {
    const tasks = (x: Dossier) => [...new Set(x.researchJobs.map((j) => j.task))].sort();
    const common = tasks(all.find((x) => !poa.includes(x))!);
    for (const x of all) expect(tasks(x), x.initiative.slug).toEqual(common);
  });

  it("offers the same correction link: every initiative and claim id is a valid correction target", () => {
    const base = { category: "incorrect", proposedCorrection: "A proposed correction text.", evidenceUrl: "https://example.org/e", explanation: "An explanation that is long enough.", elapsedMs: 10_000 };
    for (const x of all) {
      expect(SubmissionSchema.safeParse({ ...base, targetType: "initiative", targetId: x.initiative.id }).success, x.initiative.id).toBe(true);
      expect(findInitiative(d, x.initiative.id)?.id).toBe(x.initiative.id);
      for (const c of x.claims) expect(SubmissionSchema.safeParse({ ...base, targetType: "claim", targetId: c.id }).success, c.id).toBe(true);
    }
  });
});
