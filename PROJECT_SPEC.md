# Project specification

Concise form of the master implementation prompt (sections 1 to 35) and the update that adds Items 1 to 14. Status as of 27 Nov 2026, branch `feat/full-platform`.

## Purpose and positioning

ETHSecurity Intelligence is an independent research and decision-support platform for the initiatives on the TheDAO Security Fund ballot. Its users are ETHSecurity badge holders and anyone reviewing the round.

- It never advocates and never tells anyone how to vote. TheDAO's official platform ([initiatives.thedao.fund/vote](https://initiatives.thedao.fund/vote)) remains responsible for actual voting. This product is research and decision-support only.
- Proof of Audits has an initiative on this ballot and builds this site. Exactly the same research requirements, evidence standards, templates and wording apply to it as to every other initiative (master spec section 31).
- No ranking, universal score or default order other than alphabetical.
- Every figure and quote shown in the UI, the API, the MCP server and exports must be true. The truth audit (`research/audit.ts`) blocks publication when a published fact differs from the raw official object.

## Scope

- **Cohort:** the initiatives returned by the official ballot list when the cohort was frozen (`data/cohort.json`, 55 initiatives on 26 Nov 2026). Eligibility changes are flagged, never applied silently.
- **Sources:** the official TheDAO Security Fund API and vote manifest, plus public research sources (GitHub, websites cited in proposals, Ethereum JSON-RPC). See [ATTRIBUTION.md](ATTRIBUTION.md).
- **Store:** MongoDB (Atlas free tier M0 or local), with a read-only file fallback to `data/published/`.

## Master spec features

| Feature | Status |
| --- | --- |
| Official ingestion, normalization, content-addressed snapshots | Implemented, tested |
| Research collectors (websites, GitHub, milestone artifacts, onchain donations), claims and evidence | Implemented, tested |
| Truth audit and validated publishing | Implemented, tested |
| MongoDB store, validators, indexes, file fallback | Implemented, tested against MongoDB 8.2.6 in memory. Atlas: blocked, see below |
| Public read API `/api/v1`, corrections and moderation | Implemented, tested |
| Overview, Research table and cards, dossiers, source inspector | Implemented, tested |
| Advanced views: compare, graph, coverage, blind spots, changes, what-if, Milestone X-Ray, funding relationships, collaboration | Implemented, tested |
| My Workspace (browser only) | Implemented, tested |
| Read-only MCP server (stdio and Streamable HTTP), AI Lab, generated research skills | Implemented, tested |
| Reference pages: methodology, status, corrections, about | Implemented, tested |
| Docs, CI, issue templates, screenshots | Implemented |
| MongoDB Atlas production connection | Blocked: the connection fails with TLS alert 80, consistent with the sandbox IP not being on the Atlas Network Access list (not tested from an allowed address). Code paths are tested locally |

## Update items

| Item | Title | Status |
| --- | --- | --- |
| 1 | Neutral language rules and AI output filter | Implemented, tested |
| 2 | Disclosure, neutrality and privacy hardening | Implemented, tested |
| 3 | Official vote manifest ingestion and TheDAO ask metric | Implemented, tested |
| 4 | Vote Calendar | Implemented, tested |
| 5 | Ballot Prep in My Workspace | Implemented, tested |
| 6 | Affiliation and conflict flags | Partially implemented: the optional public badge-holder lookup is off because no verifiable public source exists |
| 7 | May interest you | Implemented, tested (limited to the behavior specified before the update message was cut off) |
| 8 | Evidence card | Implemented, tested |
| 9 | Round 1 history | Implemented, tested |
| 10 | Similar initiatives | Implemented, tested. The optional AI hypotheses were not shipped |
| 11 | Open questions | Implemented, tested |
| 12 | 10-minute briefing | Partially met: no service worker, so offline reading works only from the browser's own cache |
| 13 | Review progress, changes, export | Implemented, tested, with known limitations (see Item 13) |
| 14 | AI labelling | Implemented, tested |

Each item section below states what ships, how it is tested and its known limits. The rules are in [METHODOLOGY.md](METHODOLOGY.md).

### Item 1: Neutral language

One versioned wording standard, [NEUTRAL_LANGUAGE.md](NEUTRAL_LANGUAGE.md) (version `2026.11-v1`), with a banned-phrase list, allowed framing, four source labels and a "Not found" rule. Enforced by a source lint in `npm test`, by `filterAiOutput` on generated text (AI Lab briefs, MCP instructions and notes) and by `npm run skills:build`.

### Item 2: Disclosure, neutrality and privacy

- A banner on every page, including error pages, overlays and the mobile source inspector: "Built by Proof of Audits, which has an initiative on this ballot. Unofficial tool. It never sees your vote. Every initiative is treated the same." It links to `/about#coi`.
- Equal-treatment tests: a static scan fails if engine code names Proof of Audits, and a parity test over all 55 dossiers checks identical sections, evidence rules and correction support.
- Privacy: the Methodology page lists what is stored in the browser, on the server and never; an automated test keeps it equal to the code. No analytics, no third-party requests, no wallet connection. Optional correction contacts are encrypted and deleted after 30 days.

### Item 3: Vote manifest and TheDAO ask

- `npm run ingest` fetches `https://initiatives.thedao.fund/api/vote/manifest` and stores it with the official snapshot. The manifest is used for affiliation groups, the pool and the schedule only after an alignment check confirms that `slugs[i]` and `projects[i]` belong together for every index.
- **TheDAO ask** = `min(200000, max(0, goalUsd - raisedUsd))` per initiative, in integer cents. It is the headline funding figure. The **remaining funding gap** `max(0, goalUsd - raisedUsd)` is a separate, secondary metric. Unavailable inputs make the ask "Unavailable", never 0.
- The truth audit recomputes both from the raw ballot object and checks every manifest-derived field.
- **Server-side cache.** Between publishes, the server re-reads the manifest at most once every 12 minutes, shared by all visitors and API callers (TheDAO's API is never called per user). The live pool, schedule and read block replace the published ones only when the published snapshot holds a manifest (never over an "unavailable" one) and the read passes the schema, the alignment check against the published cohort and goals, and the schedule check; a failed or broken read never replaces a valid value. The Overview, My Workspace, the data-freshness page and the API render per request, so a shown pool or schedule is at most 12 minutes old. The data-freshness page shows which source is in use, the read time and any failed read; the API lists the live fields in `live.fields`.
- **Partial:** affiliation groups, registered goals and TheDAO asks are not refreshed by this cache. They change only when `npm run ingest` and `npm run publish` produce a dataset that passes the truth audit and it is deployed. The scheduled refresh workflow (`refresh.yml`, every 6 hours) only uploads the published dataset as an artifact; it does not deploy it or load it into MongoDB. "Since your last visit" therefore compares asks between published datasets, and the asks' date is shown next to them.

### Item 4: Vote Calendar

A strip on the Overview and in My Workspace with the S, A and B first tally times from the manifest (`schedule.firstTallyAt`), a countdown, and the time in local time, UTC and India Standard Time. It lists the A-tier (7 Dec) and B-tier (9 Dec) tallies, results by 5, 9 and 11 Dec, and community funding until 31 Jan 2027. When `schedule.firstTallyAt` is missing, the tally times fall back to 3, 7 and 9 Dec 2026 at 21:00 UTC from TheDAO's voting post, each marked as a fallback, and the data-freshness page flags the fallback. After all tiers have settled (manifest `closesAt`, or 11 Dec 2026 21:00 UTC in fallback mode) the strip switches to "Results and community funding until 31 Jan 2027" and keeps the tally history. Dates not in the manifest are quoted from the post.

### Item 5: Ballot Prep

A private draft in My Workspace: put any initiative in S, A or B, and see an unofficial pre-check of the three ballot rules (see [METHODOLOGY.md](METHODOLOGY.md#ballot-prep-rules)), with a one-line fix for each failing rule. When the live pool comes from a manifest with another config revision than the published groups and ballot rules, a note above the rule checks names both revisions. If the manifest is missing or not confirmed, the rule checks are disabled and the section says so; placing initiatives and exporting the draft still work, and the export records `checks: null`. Copy draft, Export JSON, Clear my draft and a link to the official ballot. Nothing is sent anywhere; the site never connects a wallet.

### Item 6: Affiliation flags

- Official: "Affiliated with:" lists initiatives that share an affiliation group in the manifest, shown in the research table, cards, dossiers and Ballot Prep.
- Personal: "My affiliations" matches the organizations a holder types against manifest groups, recipient teams and published aliases, in the browser. Matches show "You may be affiliated" with the matched text and, in Ballot Prep, "Possibly your own or affiliated" next to the tier chip with the matched text on its own line. Generic words (Labs, Foundation, Security, Protocol and others) never match on their own, and an entry must match as a whole name at the start of an official name segment, so an unrelated firm that shares one word with an official name ("Runtime Verification" and "Runtime Capital") is not flagged, and a word inside a longer official name does not match it ("Intel" in "Security Alliance (SEAL) Intel", "Bloom" in "Sem Bloom", "Alliance" in "Security Alliance"). Brand suffixes may be added or left out ("Nethermind Security" matches "Nethermind", "Remix Project" matches "Remix", "Kleros DAO" matches "Kleros"), but two different suffixes are two names ("Runtime Foundation" is not "Runtime Capital"), and "Alliance DAO" does not match "Security Alliance (SEAL)". A manifest group that is a name of one organization carries that organization's other names ("Argot Collective" matches group "Argot"). A single word that starts an official name matches it ("Runtime" matches "Runtime Capital"), with the matched text shown. Manual marks win.
- No initiative is ever hidden or reordered by a flag.
- The optional "Find my public profile" lookup is shipped disabled with an explanation. No verifiable public source lists badge holders with handles, organizations and expertise (checked 26 Nov 2026 on thedao.fund, the initiatives API and the BlossomLabs/thedao-initiatives repository). No entries were compiled or invented.

### Item 7: May interest you

A view in My Workspace built from local inputs only: focus chips (the 10 official categories and the 8 AI Lab research modes) and typed keywords (whole words; common endings such as "attacks" for "attack" and "securing" for "secure" also match). Results are grouped by focus, alphabetical inside each group, and each item shows its reason and at least one evidence link. No score, rank or match percentage. The mode mapping table is in [METHODOLOGY.md](METHODOLOGY.md#may-interest-you).

### Item 8: Evidence card

Every dossier opens with the same six-section card for all 55 initiatives: Shipped work, Funding, Prior funding, Team and track record, Audits or reviews, Not found. Each fact has a source label, a source link and a "checked on" date. Broken links are flagged, not hidden. Research rows carry a one-line summary. A possible self-pledge is flagged as "unverified". Built from stored results; no request is made when a page loads. Acceptance: tests/unit/evidence-card.test.ts (same section keys for all 55, link and date on every item, a link checker that flags a 404 and not a 200, no banned phrase) and axe in tests/e2e/evidence-card.spec.ts. Rules: [METHODOLOGY.md](METHODOLOGY.md#evidence-card).

### Item 9: Round 1 history

135 records from the TheDAO transparency report for the Ethereum Security QF round (23 Apr to 14 May 2026), matched to initiatives and organizations by one function (`computeRound1Matches`) with three stated reasons: same project page, same website, same organization name or recorded alias. Weaker overlaps are shown as "Possible match: please verify". Result on the published dataset: 30 of 55 initiatives and 32 of 83 organizations have matches; 5 initiative matches are possible matches. Every record has a source URL and a checked-on date, and the truth audit recomputes the matches. Proof of Audits goes through the same function. Acceptance: tests/unit/round1.test.ts (exact, alias and ambiguous matches; source URL and date on all 135 records). Limitation: the records come from a hashed script bundle, not a documented API. Rules: [METHODOLOGY.md](METHODOLOGY.md#round-1-history).

### Item 10: Similar initiatives

Pairs of initiatives with shared text signals, labeled "Possible overlap", "Possible complement" or "Same organization", each with the quoted evidence from both proposals and a "research hypothesis, not a finding" notice. A pair is shown only with a text signal plus a second signal or one strong signal, so category-only, group-only and backer-only pairs stay hidden. Pairs are listed alphabetically, with no scores, and the output is reproducible. Result: 174 of 1,485 pairs shown (141 overlap, 30 complement, 3 same organization). Proof of Audits is analyzed with the same rules. The optional AI hypotheses were not shipped. Acceptance: tests/unit/similar.test.ts. Rules: [METHODOLOGY.md](METHODOLOGY.md#similar-initiatives).

### Item 11: Open questions

Eight rule-based questions with fixed wording, shown in each dossier and on `/research/questions`. They come from gaps in official fields and extracted claims; nothing is written by a model, and a question is not an accusation. The reader can mark a question "asked or resolved" in the private workspace and copy the list as text. Counts across the 55 initiatives, rules 1 to 8: 193, 8, 6, 34, 26, 78, 54 and 3. No code in this feature sends anything anywhere. Acceptance: tests/unit/open-questions.test.ts (one test per rule, equal wording across initiatives, no outreach code). Rules: [METHODOLOGY.md](METHODOLOGY.md#open-questions).

### Item 12: 10-minute briefing

A fixed, ordered reading list per initiative (summary, proposal sections quoted verbatim, milestones, links, Round 1 history, evidence card), each item with a source link and a reading time of words divided by 200, rounded up, minimum 1 minute. Items after minute 10 are marked Optional. Totals across the 55 initiatives run from 9 to 21 minutes, median 12. "Briefing for all in my focus" chains the briefings of the initiatives matching the reader's May interest you inputs, alphabetically. Read marks stay in the browser. No ranking or judgment language. Offline: the page needs no request after load and read marks are local, but the site has no service worker, so offline reload works only if the browser has the page cached. This criterion is partially met. Acceptance: tests/unit/briefing.test.ts. Rules: [METHODOLOGY.md](METHODOLOGY.md#briefing-and-reading-time).

### Item 13: Review progress, changes, export

A private checklist in My Workspace with four states (Not started, Reading, Reviewed, Revisit), a "You've reviewed N of M" counter, a "Since your last visit" list built by comparing the published change feed with the record stored in the browser, and exports in Markdown, CSV and JSON with sources. Revisit is set only by the site. Edits make no network request, and workspace data never reaches server logs. Acceptance: tests/unit/review-progress.test.ts (JSON round trip, change detection with mocked revisions, no network on edits) and tests/unit/privacy.test.ts. Known limitations:

- Comments are detected only through a higher official `commentCount`; comment text is not stored.
- The first visit has no baseline and lists nothing.
- Marks without a stored record get their baseline on the next visit and report no change for the time before it.
- The export context for 55 initiatives is about 200 KB and is sent with `/workspace`, so exports need no extra request.
- The data lives only in one browser; clearing browser storage removes it and the site cannot recover it.

Rules: [METHODOLOGY.md](METHODOLOGY.md#review-progress-and-change-detection).

### Item 14: AI interpretation labels

Every AI-generated statement carries the label "AI interpretation", its cited sources and provenance (model, prompt version, number of sources examined, verification status). Text without an http(s) citation is not shown. The Item 1 filter runs before display, and a blocked statement is replaced by the raw evidence. An initiative without research shows "Not yet researched", never generated prose and never a negative finding. Claims with origin `ai` are never counted as applicant statements, never counted as evidence, never listed under material without independent support, and never used for evidence coverage, the "with proof" and "stated by the applicant" lists or the open questions about integrations and figures. No confidence or score exists in any AI type. The site runs no model; the label applies to text pasted into the AI Lab result reader and to published claims with origin `ai` (none in the current dataset). Acceptance: tests/unit/ai-interpretation.test.ts. Rules: [METHODOLOGY.md](METHODOLOGY.md#ai-interpretation-and-not-yet-researched).

## Information architecture and design (interface rewrite)

The site has five tabs: Home (`/`), Initiatives (`/initiatives`), Teams (`/teams`), My Ballot (`/workspace`) and About (`/about`). Developers (`/dev`) is linked from the footer and the command palette only. The tab list lives in `components/shell/nav.ts`. Old routes (`/research/*`, `/lab`, `/methodology`, `/status`, `/corrections`) are permanent 308 redirects defined in `lib/redirects.ts` and applied in `next.config.ts`.

| Page | Contents |
| --- | --- |
| Home | Name search for badge holders, onboarding, the Vote Calendar, research status and changes, then one strip titled "Official figures (from TheDAO)" that links to the official page. Research comes first because TheDAO's site already shows its own live figures. |
| Initiatives | Grid or table, alphabetical by default and labeled; filters, compare (two to five), Questions to check, milestones, funding, coverage and What changed. |
| Dossier | `/initiatives/[slug]`: the same sections for every initiative, including the team research sections ("Not yet researched" when absent). |
| Teams | People map and one card per initiative from the team research file. |
| My Ballot | Saved initiatives, notes, May interest you, My affiliations, Ballot Prep, What-if. Browser only. |
| About | Disclosure, Why AI is here, methodology, data freshness and corrections, each under an anchor. |
| Developers | MCP instructions, research briefs, generated skills, paste-in reader. |

Name search runs entirely in the browser. The query stays in React state and is never placed in a URL, request, storage or log, and there is no form element. Matching holders show initiative cards with the evidence for each connection. No real badge-holder names are stored in tests.

Design: editorial research-report style, thin rules, one accent color, green, amber and gray reserved for evidence status, and a text label on every evidence mark. The initiative card (`components/ui/initiative-card.tsx`) is the single card for every initiative: logo or letter mark, short title, organization, evidence badges, mini funding bar and affiliation flag. No gradients, glow, glass, emoji, hero banners or icon grids.

Guards: `npm run lint:language` and `tests/unit/neutral-language-lint.test.ts` scan `app/` and `components/` (so Home, name search, the initiative card, dossier team sections, `/teams`, `/about` and `/dev`) plus `lib/team`, `lib/search` and `lib/redirects.ts`. `tests/unit/equal-treatment.test.ts` fails the build when any of those files, or any new file, names or selects Proof of Audits outside the enumerated disclosure uses, and it checks that the card, search and team modules contain no ordering or emphasis code for that organization.

## Non-goals

- Casting, recording or simulating votes; connecting wallets.
- Ranking, scoring or rating initiatives; advice on how to vote.
- Contacting initiative teams, badge holders or TheDAO.
- Paid infrastructure. Atlas use is limited to the free M0 tier.
