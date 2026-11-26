import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatHit, LINT_EXEMPT_FILES, lintPaths, lintSource } from "@/lib/neutralLanguageLint";

const root = path.resolve(import.meta.dirname, "../..");

describe("neutral-language lint on the repository", () => {
  it("finds no banned phrase in app/, components/, lib, mcp/, scripts and generated skills", async () => {
    const hits = await lintPaths(root);
    expect(hits.map(formatHit)).toEqual([]);
  });

  it("exempts only the standard and its implementation", () => {
    expect(LINT_EXEMPT_FILES).toEqual(["NEUTRAL_LANGUAGE.md", "lib/neutralLanguage.ts", "lib/neutralLanguageLint.ts"]);
  });
});

describe("neutral-language lint on seeded fixtures", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "neutral-lint-"));
    await fs.mkdir(path.join(dir, "app"), { recursive: true });
    await fs.writeFile(path.join(dir, "app", "clean.tsx"), `export const P = () => <p title="Evidence found">Question to consider</p>;\n`);
    await fs.writeFile(path.join(dir, "app", "seeded.tsx"), `export const P = () => (\n  <section>\n    <p>This is a must-fund initiative.</p>\n  </section>\n);\n`);
    await fs.writeFile(path.join(dir, "app", "skill.md"), "# Brief\n\nYou should vote for it.\n");
  });
  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("fails on a seeded banned phrase and reports file and line", async () => {
    const hits = await lintPaths(dir, ["app"]);
    expect(hits.map((h) => [h.file, h.line, h.phrase])).toEqual([
      ["app/seeded.tsx", 3, "must fund"],
      ["app/skill.md", 3, "you should"],
      ["app/skill.md", 3, "vote for"],
    ]);
  });

  it("checks string literals, templates, JSX text and attributes", () => {
    expect(lintSource("a.ts", `const a = "Best of the cohort";`)).toHaveLength(1);
    expect(lintSource("a.ts", "const a = `${n} winners`;")).toHaveLength(1);
    expect(lintSource("a.tsx", `const a = <b aria-label="Skip">x</b>;`)).toHaveLength(1);
    expect(lintSource("a.tsx", `const a = <b>Recommended</b>;`)).toHaveLength(1);
  });

  it("skips comments, identifiers, imports and literal types", () => {
    expect(lintSource("a.ts", `// skip this\n/* best */ const skipped = 1; type S = "skipped"; import x from "./best";`)).toEqual([]);
  });

  it("exempts text inside OfficialQuote only", () => {
    expect(lintSource("a.tsx", `const a = <OfficialQuote source="https://x">S-tier: must fund</OfficialQuote>;`)).toEqual([]);
    expect(lintSource("a.tsx", `const a = <figure data-official-quote="">must fund</figure>;`)).toEqual([]);
    expect(lintSource("a.tsx", `const a = <div><OfficialQuote source="x">must fund</OfficialQuote><p>must fund</p></div>;`)).toHaveLength(1);
    expect(lintSource("a.md", `<official-quote source="x">must fund</official-quote>\n\nmust fund`)).toHaveLength(1);
  });
});
