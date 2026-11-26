# Neutral language rules

Version: 2026.11-v1 (same as `NEUTRAL_LANGUAGE_VERSION` in [lib/neutralLanguage.ts](lib/neutralLanguage.ts)).

ETHSecurity Intelligence is research and decision-support only. It never advocates for or against an initiative and never tells anyone how to vote. These rules apply to every user-facing string, every piece of generated (AI-style) text and every export: the website, the REST API, the MCP server, the AI Lab briefs and the generated research skills.

Proof of Audits has an initiative on this ballot and shares an owner with this site. It gets exactly the same templates, wording, research requirements and evidence standards as every other initiative.

## Allowed framing

- "This may interest you because…"
- "Matches your selected focus: X"
- "Evidence found"
- "Not yet verified"
- "Question to consider"
- "Possible overlap"

## Banned phrases

Case-insensitive, in UI copy, generated text and exports:

"vote for", "vote against", "you should", "should fund", "should not", "recommended", "recommend", "best", "worst", "top pick", "must fund", "must-fund", "avoid", "skip", "winner", "safe bet", "underrated", "overrated", "deserves".

### How matching works

- Case does not matter: "Best", "BEST" and "best" all match.
- Words in a phrase may be joined by a space, a hyphen (ASCII or Unicode), an underscore or nothing: "must fund", "must-fund", "MUST-FUND" and "mustfund" all match.
- Inflections of a listed word match too: "recommend" also catches "recommends", "recommending" and "recommendation"; "skip" catches "skipped" and "skipping"; "avoid" catches "avoided" and "avoidance"; "winner" catches "winners"; "deserves" catches "deserve" and "deserved"; "vote for" catches "voted for" and "voting for"; "should fund" and "must fund" also catch "should be funded" and "must be funded"; "you should" and "should not" catch "shouldn't".
- A banned word that is only the start of a longer word does not match: "bestow", "skipper" and "avoider" are not hits, while "best-in-class" is, because a hyphen ends a word.

The patterns live in `PATTERNS` in [lib/neutralLanguage.ts](lib/neutralLanguage.ts). Change the lists only in this file and that module together, and bump the version in both.

## Rules

1. Every "may interest you" item shows the reason and at least one evidence link.
2. Never show scores, stars, rankings or "match %". Order is alphabetical inside each group.
3. Distinguish and label every statement by its source, with these four labels (`SOURCE_LABELS`):
   - **Official data**: records from TheDAO Security Fund API and ballot manifest.
   - **Applicant statement**: the initiative's own words, shown as quotations.
   - **Independent evidence**: machine-observed or third-party evidence collected by the research pipeline.
   - **AI interpretation**: text produced by an AI model, always marked as such.
4. Missing information is "Not found", never a negative finding.
5. The same templates and wording apply to every initiative, including Proof of Audits.

## Quotations of official sources

Official TheDAO text that contains a banned phrase may be shown only as a clearly marked quotation of an official source, never as our voice:

- In React, wrap it in `<OfficialQuote source="…">` ([components/ui/official-quote.tsx](components/ui/official-quote.tsx)). It renders the text as a block quotation with the "Official data" label and a link to the source.
- In text and Markdown, wrap it in `<official-quote source="…">…</official-quote>` (helper `officialQuote()`).

Text inside these markers is exempt from the lint and the filter. Nothing else is.

Applicant text and official records returned as data (for example claim quotes in the API, MCP results and the evidence bundle) are verbatim source records. They carry their evidence status and are passed through unchanged; they are quotations, not our voice.

## Tier wording

UI chrome must not tell the reader to fund something. Tier labels use TheDAO's own definitions in a legend, for example: "TheDAO defines S-tier as must-fund", with the official wording shown inside an official quotation.

## Enforcement

- **Source lint.** `tests/unit/neutral-language-lint.test.ts` runs in `npm test` (and so in CI). It scans `app/`, `components/`, `lib/intelligence/`, `lib/skills/`, `lib/mcp/`, `lib/corrections/`, `lib/disclosure.ts`, `lib/metrics/registry.ts`, `lib/vote/`, `mcp/`, `scripts/build-skills.ts`, the generated `skills/**/*.md` and `docs/**/*.md`. In TypeScript it checks string literals, template text, JSX text and JSX attribute strings; comments, identifiers, import paths and string literal types are skipped. Markdown files are checked in full. The test also proves the lint fails on a seeded banned phrase. Run it alone with `npm run lint:language`.
- **Exempt files.** Only this file, `lib/neutralLanguage.ts` and `lib/neutralLanguageLint.ts`, which must spell out the banned list.
- **Runtime filter.** `filterAiOutput(text, rawEvidenceFallback)` runs on generated text before it is displayed or exported. If it finds a banned phrase, the generated text is discarded and the raw evidence is shown instead. It is applied to AI Lab briefs (prompt, SKILL.md and JSON), the MCP server instructions and the text the MCP server writes itself (limitations and notes). `npm run skills:build` refuses to write a skill that fails the filter.
