# Project specification

Concise form of the master implementation prompt (sections 1 to 35) and the update that adds Items 1 to 14. Status as of 26 Nov 2026, branch `feat/full-platform`.

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
| MongoDB Atlas production connection | Blocked: the sandbox IP is not on the Atlas Network Access list (TLS alert 80). Code paths are tested locally |

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
| 8 | Evidence card | Pending specification |
| 9 | Round 1 history | Pending specification |
| 10 | Similar initiatives | Pending specification |
| 11 | Open questions | Pending specification |
| 12 | 10-minute briefing | Pending specification |
| 13 | Review progress, changes, export | Pending specification |
| 14 | AI labelling | Pending specification. The shared source labels it needs (Official data, Applicant statement, Independent evidence, AI interpretation) are already applied through Item 1 |

Items 8 to 14 were cut off in the update message. Only their titles are known, and nothing beyond the Item 14 source labels has been built for them.

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

## Non-goals

- Casting, recording or simulating votes; connecting wallets.
- Ranking, scoring or rating initiatives; advice on how to vote.
- Contacting initiative teams, badge holders or TheDAO.
- Paid infrastructure. Atlas use is limited to the free M0 tier.
