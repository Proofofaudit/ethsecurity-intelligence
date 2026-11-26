/**
 * Source lint for the neutral-language standard (NEUTRAL_LANGUAGE.md). Node-only; used by
 * tests/unit/neutral-language-lint.test.ts (so `npm test` and CI fail on a banned phrase) and by
 * `npm run lint:language`.
 *
 * What is scanned:
 * - .ts/.tsx: string literals, template literal text, JSX text and JSX attribute strings. Comments,
 *   identifiers, import paths and string literal types are not user-facing and are skipped.
 *   Everything inside a <OfficialQuote> element (or an element with data-official-quote) is exempt.
 * - .md: the whole file, except text inside <official-quote>…</official-quote>.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { findBannedPhrases, OFFICIAL_QUOTE_ATTR, type BannedMatch } from "@/lib/neutralLanguage";

/** Directories and files scanned by default, relative to the repository root. */
export const LINT_TARGETS = [
  "app",
  "components",
  "lib/intelligence",
  "lib/skills",
  "lib/mcp",
  "lib/disclosure.ts",
  "lib/corrections",
  "lib/metrics/registry.ts",
  "mcp",
  "scripts/build-skills.ts",
  "skills",
  "docs",
];

/**
 * The only files exempt from the lint: the standard itself and its implementation, which must
 * spell out the banned phrases.
 */
export const LINT_EXEMPT_FILES = ["NEUTRAL_LANGUAGE.md", "lib/neutralLanguage.ts", "lib/neutralLanguageLint.ts"];

const EXTENSIONS = new Set([".ts", ".tsx", ".md"]);
const IGNORED_DIRS = new Set(["node_modules", ".next", ".git"]);

export interface LintHit extends BannedMatch {
  file: string;
  line: number;
  /** The scanned string or line the hit came from. */
  context: string;
}

function lineOf(source: string, offset: number) {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

function isOfficialQuoteElement(node: ts.Node): boolean {
  const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
  if (!opening) return false;
  if (opening.tagName.getText() === "OfficialQuote") return true;
  return opening.attributes.properties.some((p) => ts.isJsxAttribute(p) && p.name.getText() === OFFICIAL_QUOTE_ATTR);
}

/** Extracts user-facing text pieces with their offsets from TypeScript or TSX source. */
export function extractStrings(fileName: string, source: string): { text: string; pos: number }[] {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const out: { text: string; pos: number }[] = [];
  const visit = (node: ts.Node) => {
    if (isOfficialQuoteElement(node)) return;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isLiteralTypeNode(node) || ts.isExternalModuleReference(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      out.push({ text: node.text, pos: node.getStart(sf) });
    } else if (ts.isJsxText(node)) {
      if (node.text.trim()) out.push({ text: node.text, pos: node.getStart(sf) });
    } else if (ts.isTemplateExpression(node)) {
      out.push({ text: node.head.text, pos: node.head.getStart(sf) });
      for (const span of node.templateSpans) {
        visit(span.expression);
        out.push({ text: span.literal.text, pos: span.literal.getStart(sf) });
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Lints one file's content. `file` decides the parser by extension. */
export function lintSource(file: string, source: string): LintHit[] {
  if (file.endsWith(".md")) {
    return findBannedPhrases(source).map((m) => ({ ...m, file, line: lineOf(source, m.index), context: source.split("\n")[lineOf(source, m.index) - 1]!.trim() }));
  }
  return extractStrings(file, source).flatMap((s) => findBannedPhrases(s.text).map((m) => ({ ...m, file, line: lineOf(source, s.pos), context: s.text.trim().slice(0, 200) })));
}

async function walk(abs: string, acc: string[]) {
  const st = await fs.stat(abs).catch(() => null);
  if (!st) return;
  if (st.isFile()) {
    if (EXTENSIONS.has(path.extname(abs))) acc.push(abs);
    return;
  }
  for (const e of await fs.readdir(abs, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(e.name)) continue;
    await walk(path.join(abs, e.name), acc);
  }
}

/** Scans `targets` (files or directories, relative to `root`) and returns every banned hit. */
export async function lintPaths(root: string, targets: string[] = LINT_TARGETS): Promise<LintHit[]> {
  const files: string[] = [];
  for (const t of targets) await walk(path.resolve(root, t), files);
  const exempt = new Set(LINT_EXEMPT_FILES.map((f) => path.resolve(root, f)));
  const hits: LintHit[] = [];
  for (const abs of [...new Set(files)].sort()) {
    if (exempt.has(abs)) continue;
    const rel = path.relative(root, abs).split(path.sep).join("/");
    hits.push(...lintSource(rel, await fs.readFile(abs, "utf8")));
  }
  return hits;
}

export const formatHit = (h: LintHit) => `${h.file}:${h.line} "${h.match}" (banned: ${h.phrase}) in: ${h.context}`;
