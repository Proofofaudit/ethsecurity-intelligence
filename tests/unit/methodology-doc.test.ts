/**
 * METHODOLOGY.md reproduces the editable research-mode mapping from lib/vote/interest.ts and the
 * affiliation stoplist from lib/vote/affiliation.ts. The code is the single source; this test
 * fails when the documented copy drifts from it.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FOCUS_MODE_TABLE, KEYWORD_ENDINGS } from "@/lib/vote/interest";
import { MODE_BY_ID } from "@/lib/skills/modes";
import { GENERIC_WORDS, OPTIONAL_WORDS } from "@/lib/vote/affiliation";

const doc = fs.readFileSync(path.join(process.cwd(), "METHODOLOGY.md"), "utf8");

function modeRows(): Map<string, { categories: string[]; keywords: string }> {
  const start = doc.indexOf("### Research mode mapping");
  const lines = doc.slice(start).split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Research mode") && !l.startsWith("| ---"));
  const rows = new Map<string, { categories: string[]; keywords: string }>();
  for (const line of lines) {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    const mode = /\(`([^`]+)`\)/.exec(cells[0] ?? "")?.[1];
    if (!mode) break;
    rows.set(mode, { categories: [...(cells[1] ?? "").matchAll(/\(`([^`]+)`\)/g)].map((m) => m[1]!), keywords: cells[2] ?? "" });
  }
  return rows;
}

describe("METHODOLOGY.md", () => {
  it("reproduces FOCUS_MODE_TABLE exactly, in order", () => {
    const rows = modeRows();
    expect([...rows.keys()]).toEqual(FOCUS_MODE_TABLE.map((m) => m.mode));
    for (const m of FOCUS_MODE_TABLE) {
      const row = rows.get(m.mode)!;
      expect(row.categories).toEqual([...m.categories]);
      expect(row.keywords).toBe(m.keywords.join(", "));
      expect(doc).toContain(`| ${MODE_BY_ID.get(m.mode)?.label} (\`${m.mode}\`) |`);
    }
  });

  it("lists the affiliation stoplist exactly", () => {
    expect(doc).toContain(`(\`GENERIC_WORDS\`, ${GENERIC_WORDS.length} words, edit it in \`lib/vote/affiliation.ts\`): ${GENERIC_WORDS.join(", ")}.`);
  });

  it("lists the optional affiliation words and the keyword endings exactly", () => {
    expect(doc).toContain(`(\`OPTIONAL_WORDS\`, ${OPTIONAL_WORDS.length} words): ${OPTIONAL_WORDS.join(", ")}.`);
    expect(doc).toContain(`(\`KEYWORD_ENDINGS\`): ${KEYWORD_ENDINGS.join(", ")}.`);
  });
});
