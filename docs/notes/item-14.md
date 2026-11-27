# Item 14: AI labelling and untrusted-source handling

## Rules

- Every AI-generated statement shown in the UI carries the label "AI interpretation", its cited sources and provenance (model, prompt version, number of sources examined, verification status).
- Generated text without at least one http(s) citation is not shown. The underlying evidence is listed, or "Not yet researched" when there is none.
- The Item 1 filter (`filterAiOutput`) runs before display. A blocked statement (advice to fund an initiative) is replaced by the raw evidence and the filter notice.
- Missing research is a visible "Not yet researched" state. It is never shown as a negative finding.
- No confidence, score or probability appears in any AI type, schema or component.
- External content is untrusted data. It is rendered as plain text, never as HTML or Markdown, and never followed as instructions.

## Usage

- `AiInterpretation`, `NotYetResearched`: `@/components/ui/ai-interpretation`
- `prepareAiInterpretation` (pure display decision): `@/lib/ai/interpretation`
- `researchCoverage`, `blindSpotSources`: `@/lib/intelligence/service`
- Lab "Read an AI research result" panel: `components/lab/result-reader.tsx`. It parses pasted JSON with `ResearchOutputSchema`, renders each finding through `AiInterpretation` and shows `injectionAttempts` as plain data. Nothing is fetched or stored.

## Audit of places where generated text can appear

| Place | Origin | Labelled "AI interpretation"? |
| --- | --- | --- |
| Dossier "Strongest supporting arguments" (`app/initiatives/[slug]/page.tsx`) | Deterministic claim list | No. A "Not yet researched" AI slot shows until an AI result is published. |
| Dossier "Strongest counterarguments" | Deterministic rules (`blindSpots`) with sources from `blindSpotSources` | No. Phrased as questions with a basis and a source link. |
| Executive briefing and plain explanations | Deterministic templates in `lib/intelligence/service.ts` | No. The site runs no AI model. |
| Inspector origin label (`components/dossier/inspector.tsx`) | Reads `claim.origin`; "AI interpretation (not verified)" only for origin `ai` | Yes, only for model text. |
| Lab briefs (`lib/skills/build.ts`, `app/lab`, `components/lab`) | Deterministic code, run through `filterAiOutput` in `buildNeutralBrief` | No. They are instructions for the reviewer's own assistant. |
| MCP catalog and server, REST API (`lib/mcp/catalog.ts`, `mcp/server.ts`, `app/api/v1`) | Deterministic dataset reads | No. Claims with origin `ai` carry that origin field. |
| Lab result reader | Model text pasted by the reviewer | Yes, with citations. |

## Prompt injection

Briefs are built from configuration only. Retrieved text never enters `buildSkill` or `buildPrompt`, and the section "Untrusted content and prompt injection" is byte-identical for every configuration (tested). The brief tells the assistant to quote injected instructions under `injectionAttempts` and continue.

## Tests

`tests/unit/ai-interpretation.test.ts` covers the label and citations, text without a citation, the filter block on funding advice, unsafe URLs, HTML escaping, "Not yet researched" for an initiative without research, the injection section and the no-confidence guard.
