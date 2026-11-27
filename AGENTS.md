# Rules for agents and contributors

These rules persist across tasks. Read them before changing anything. When a rule and a request conflict, stop and ask.

## Product rules

1. **Research only.** Never advocate for or against an initiative and never tell anyone how to vote. TheDAO's official platform handles voting.
2. **Neutral language.** All user-facing text, generated text and exports follow [NEUTRAL_LANGUAGE.md](NEUTRAL_LANGUAGE.md). Use the allowed framing and the four source labels. Official text that contains a banned phrase may appear only inside `<OfficialQuote>` (React) or `<official-quote>` (text). Never run `filterAiOutput` over raw dataset records; applicant text contains banned words as quotations.
3. **Equal treatment.** Proof of Audits builds this site and has an initiative on the ballot. It gets the same templates, wording, research requirements and evidence standards as every other initiative. Select it only through `isCoiOrganization` and only to show a disclosure. Any new mention in code must be added to the `ALLOWED` map in `tests/unit/equal-treatment.test.ts` with a reason.
4. **No ranking.** No scores, stars, ranks, match percentages or invented metrics. The default order is "Alphabetical (neutral)" and is labeled.
5. **Accuracy.** Every figure and quote must be true and traceable to a source. Missing data is "Unavailable" or "Not found", never 0 and never a negative finding. Extend `research/audit.ts` for anything new the UI asserts. `npm run publish` must report 0 failures.
6. **Evidence statuses.** Applicant text appears only as verbatim quotes with status `applicant_reported` or `future_target`. Only machine-observed evidence can produce `independently_verified` or `partially_supported`.
7. **Money.** Integer cents (micro-USD as BigInt for manifest values). Funding total = pledged + donated; received pledges are inside donated and are never added twice. The ballot endpoint's `totals` block is never used.
8. **Privacy.** Personal workspace data (including review progress, the visit snapshot, briefing read marks and open question marks) stays in the browser under `esi.workspace`, `esi.lab.templates` and `esi.theme`. Adding a key means updating `lib/privacy.ts`, the Methodology Privacy text and `tests/unit/privacy.test.ts`. No analytics, no third-party requests, no wallet connection, no logging of user input.
9. **AI text.** Claims with origin `ai` are never applicant statements and never evidence, and are excluded from the material-without-independent-support list (`lib/intelligence/unsupported-material.ts`). Any AI text is shown through `AiInterpretation` with the label "AI interpretation", citations and provenance, after `filterAiOutput`. An initiative without research shows "Not yet researched".
10. **Reproducible analysis.** Round 1 matches, Similar initiatives, Open questions and briefing reading times come from one pure function each, run for every initiative, with no special case for any organization. Output is ordered by a fixed documented rule (never by score), has no scores, and is recomputed by the truth audit or covered by a test. Open questions never send, draft or queue messages.
11. **Disclosure.** The banner text in `lib/disclosure.ts` appears on every page. Do not remove or reword it.

## Engineering rules

- **No secrets in git.** Connection strings, tokens and keys live only in `.env.local` (ignored). Before every commit run `git diff --cached | grep -E 'mongodb\+srv://[^ ]+@|ghp_[A-Za-z0-9]{36}|BEGIN [A-Z ]*PRIVATE KEY'` and confirm it prints nothing. Never print a connection string in logs, docs, tests or screenshots; `lib/db/redact.ts` redacts hosts in errors.
- **Free tier only.** MongoDB Atlas M0: CRUD, indexes and `collMod` only.
- **Single engine.** UI, API, MCP and exports read through `lib/intelligence/service.ts`. Do not compute figures in components.
- **Generated files.** `data/published/*` comes from `npm run publish`, `data/official/**` from `npm run ingest`, `skills/` from `npm run skills:build`, `docs/screenshots/` from `npm run screenshots`. Do not edit them by hand.
- **Design.** Editorial research-report style: thin rules, one accent color, green/amber/gray reserved for evidence status, evidence marks always with a text label. No gradients, glow, glass, emoji, hero banners or icon grids.
- **Language.** American English, no em dashes, no typos. Run `npx cspell "**/*.md" --no-progress` on docs.
- **Scope.** Do not invent features or data. [PROJECT_SPEC.md](PROJECT_SPEC.md) records what Items 1 to 14 ship and what they do not (no AI hypotheses in Similar initiatives, no service worker).
- **Outreach.** Never email or contact initiative teams, badge holders or TheDAO.

## Commands

| Task | Command |
| --- | --- |
| Install | `npm ci` |
| Type check | `npm run typecheck` (does not cover `tests/e2e`; `npm run build` does) |
| Lint | `npm run lint`, `npm run lint:language` |
| Unit and integration tests | `npm test` |
| Build | `npm run build` |
| End-to-end tests | `npm run test:e2e` (after a build) |
| MCP smoke test | `npm run mcp:smoke` |
| Truth audit and publish | `npm run publish` |
| Screenshots | `npm run screenshots` (after a build) |
| Atlas check | `node --env-file=.env.local --import tsx scripts/db-ping.ts` |

All of these must pass before a commit that changes code. CI runs them on every push and pull request.

## Known quirks

- Right after `npm run build`, the first `npm run test:e2e` has occasionally failed to start the web server (missing `.next/server/preview-props.json`). Rebuilding and rerunning works.
- `pkill -f "next start"` inside a shell command also matches that command and kills it.
- Next.js prefetches linked pages with same-origin `?_rsc` GET requests; network assertions must allow those.
