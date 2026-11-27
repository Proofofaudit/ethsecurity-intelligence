# Methodology

Methodology version `2026.11-v1` (`METHODOLOGY_VERSION` in [lib/metrics/registry.ts](lib/metrics/registry.ts)). The in-app Methodology page (`/methodology`) renders the same definitions from the code. Where this file reproduces a table from the code, the code is the single source and this file says which module holds it.

ETHSecurity Intelligence is research and decision-support only. Nothing here ranks, scores or advises. All wording follows [NEUTRAL_LANGUAGE.md](NEUTRAL_LANGUAGE.md).

## Sources and origins

Every record carries its origin (`Origin` in [lib/domain/schemas.ts](lib/domain/schemas.ts)) and provenance (source URLs, retrieval time, method, version):

| Origin | Meaning | Shown as |
| --- | --- | --- |
| `official` | Copied from TheDAO Security Fund API or vote manifest. Never overwritten by research. | Official data |
| `applicant` | Stated by the applicant in proposal text. | Applicant statement (verbatim quote) |
| `external` | Observed by the research pipeline from a public third-party source. | Independent evidence |
| `derived` | Computed deterministically from the above. | Labeled with its formula |
| `curated` | Recorded by a researcher with cited sources. | Independent evidence, with sources |
| `ai` | AI-generated interpretation. Never treated as verified fact. | AI interpretation |

Missing information is shown as "Not found" or "Unavailable", never as 0 and never as a negative finding.

## Evidence statuses

Each statement has exactly one status. The status mark is always shown with its text label.

| Status | Label | Definition |
| --- | --- | --- |
| `independently_verified` | Independently verified | Machine-observed evidence from a source other than the applicant confirms the statement, for example the GitHub API showing a cited repository is public, or an onchain receipt confirming a donation. |
| `partially_supported` | Partially supported | Evidence supports part of the statement but does not confirm all of it, for example a merged pull request linked to a milestone marked complete. |
| `applicant_reported` | Applicant-reported | Stated by the applicant in the proposal. Shown as a verbatim quote and not treated as fact. |
| `not_independently_verified` | Not independently verified | The research pipeline looked for supporting evidence and found none. This is not evidence that the statement is false. |
| `officially_reported` | Officially reported | Recorded in the official TheDAO Security Fund API, such as goals, pledges and milestones. |
| `future_target` | Future target | A planned deliverable or commitment. It cannot be verified until it happens. |
| `contradicted` | Contradicted by evidence | Observed evidence conflicts with the statement. |
| `disputed` | Disputed | The statement is the subject of an unresolved dispute. |
| `outdated` | Outdated | Superseded by newer information. |
| `not_applicable` | Not applicable | The status does not apply to this record. |

Only machine-observed evidence can produce `independently_verified` or `partially_supported`. Applicant text is always `applicant_reported` or `future_target`.

## Claims and verification

`research/claims.ts` extracts claims of these kinds: milestone deliverables and completions, existing artifacts (repositories, products, links), quantitative statements, integrations, previous funding, pledges, received funding, donations, team profiles, adoption commitments and curated findings. Each claim stores the verbatim quote, its section, the evidence it was checked against and a plain-text `verificationMethod`, for example:

- Donations: each official transaction receipt is fetched from public Ethereum JSON-RPC and must exist, have succeeded and transfer to the initiative's Safe.
- Repositories: the GitHub REST API must return the cited repository as public.
- Team profiles: GitHub confirms that a linked account exists. Ownership of the profile is not verified, and the method says so.
- Previous grants: quoted from the proposal. Funder records were not independently retrieved.

Accepted public corrections change a claim's status or assertion and add an entry to its history.

## Truth audit

`npm run publish` runs `research/audit.ts` before writing `data/published/dataset.json`. The audit recomputes every published figure and quote from the raw, content-addressed official objects: funding identities, per-initiative and cohort sums, milestones, pledges, donations, quotes, the TheDAO ask and remaining gap, the vote pool, schedule, ballot rules flag, manifest arrays, alignment and affiliation groups, and every Round 1 record and match (see [Round 1 history](#round-1-history)). Publication is refused when any check fails. The result is stored in `data/published/audit.json`.

## Funding identities

- Official raised = outstanding pledges + confirmed donations (`summary.total`). Received pledges are already inside donations and are never added twice.
- The ballot endpoint's `totals` block is never used, because it covers all approved initiatives, not the cohort.
- All money is integer US cents. Manifest values are six-decimal USD strings, handled as integer micro-USD (BigInt) and converted to cents only when exact.

## TheDAO ask and remaining funding gap

| Metric | Formula | Role |
| --- | --- | --- |
| TheDAO ask (`initiative.thedao_ask`) | `min(200000, max(0, goalUsd - raisedUsd))` | Headline funding figure: what the initiative still asks TheDAO's pool for. |
| TheDAO ask, sum (`cohort.thedao_ask`) | sum of the per-initiative asks over the cohort | Unavailable if any initiative's ask is unavailable. |
| Remaining funding gap (`initiative.remaining`, `cohort.remaining`) | `max(0, goalUsd - raisedUsd)`, uncapped | Separate, secondary metric shown for context. |

- Over-funded or exactly funded initiatives ask $0.
- Unavailable inputs make the ask "Unavailable", never 0 (`lib/metrics/ask.ts`).
- The $200,000 cap is the update specification's cap. It equals TheDAO's ballot qualification setting `capUsd` (200,000 in `shared/vote.ts` of [BlossomLabs/thedao-initiatives](https://github.com/BlossomLabs/thedao-initiatives)): an initiative qualifies for the ballot with no more than $200,000 left. For initiatives on the ballot the cap therefore does not change the value. In the dataset of 26 Nov 2026 13:08 UTC the largest single gap was $199,000, and the TheDAO ask sum equaled the remaining gap sum.
- The ask is computed from the official API at each sync. The vote contract computes its own ask onchain when a ballot is recorded, and the two can differ between syncs.

## Official vote manifest

`npm run ingest` fetches `https://initiatives.thedao.fund/api/vote/manifest` (payload under `manifest`) and stores it content-addressed with the snapshot (`research/ingest.ts`, `lib/vote/manifest.ts`).

- **Alignment.** Group-dependent features use the manifest only after `checkAlignment` confirms: the round kind, `projects.length == slugs.length`, unique slugs, the same set of slugs as the cohort, for every index the same registered goal and RFP flag as the official ballot record, valid group indexes, RFPs without groups, and the accounts length. Only then is `status` `aligned` and `initiativeGroups` filled.
- **Unaligned.** The raw arrays are kept as published, never remapped, and groups are not used.
- **Unavailable.** A 4xx response or a changed shape makes the manifest unavailable. Transport errors, 5xx and 429 reuse the previous stored manifest, marked stale.
- **Disabled features.** When groups or the schedule are unavailable, the UI lists what is off: affiliation groups, Ballot Prep checks and the tally countdown from the official schedule.
- **Pool.** `poolUsd` (micro-USD) converted exactly to cents. A value with sub-cent digits is shown as unavailable rather than rounded.
- **Live pool and schedule.** Between publishes, the server re-reads the manifest at most once every 12 minutes (`LIVE_TTL_MS` in `lib/vote/constants.ts`), shared by every visitor and API caller, so TheDAO's API is never called per user or per request (`lib/vote/live.ts`). The Overview, My Workspace, the data-freshness page and `GET /api/v1/vote-manifest` show the live `poolUsd`, `opensAt`, `closesAt`, `schedule` and `readAt` only when the published snapshot holds a manifest (status aligned or unaligned; an unavailable snapshot shows no pool or schedule until a dataset with the manifest is published) and the read passes the response schema, the same alignment check against the published cohort and ballot goals, and the schedule check. A failed or invalid read never replaces a valid value: the last valid live read stays, or else the published snapshot, and the data-freshness page reports the failure. Affiliation groups, registered goals and TheDAO asks are not refreshed this way; they change only when a new dataset passes the truth audit and is published, and the published `configRevision` stays with them (the API's `live.configRevision` gives the live read's; when they differ, `live.revisionNote` names both, on the data-freshness page and above the Ballot Prep rule checks). The Overview, My Workspace, the data-freshness page and the API are rendered on every request and read the shared cache, so no page cache adds to its age: a pool or schedule shown is at most 12 minutes old, and the Vote Calendar shows the read time. `ESI_LIVE_MANIFEST=off` turns the live read off (the end-to-end tests and screenshots use the snapshot only).

## Vote Calendar

Tally times come from the manifest `schedule.firstTallyAt` (unix seconds, S, A, B). Each tally starts at 21:00 UTC. The countdown floors to the minute and the strip shows local time, UTC and India Standard Time (`Asia/Kolkata`). The round counts as settled at the manifest `closesAt`. "A tier settles within N hours" is computed from the manifest's halving tally windows (`initialWindow` + `initialWindow`/2 + ... for `maxWindows` windows, rounded up to whole hours; 48 for the current round). When `schedule.firstTallyAt` is unavailable, the tally times fall back to the dates in TheDAO's [voting post](https://paragraph.com/@thedao.fund/voting-is-live-which-security-initiatives-will-make-s-tier): S-tier 3 Dec, A-tier 7 Dec and B-tier 9 Dec 2026, each at 21:00 UTC ("Each tally starts at 9:00 PM UTC"). The settled state then starts 48 hours after the B-tier fallback tally (11 Dec 2026 21:00 UTC; the post: "A tier always settles within 48 hours of its first tally"). The strip says "Fallback times, manifest unavailable", each tier row is marked "(fallback)", and the data-freshness page flags the fallback. Dates that are not in the manifest (results by 5, 9 and 11 Dec; community funding until 31 Jan 2027) are quoted from that post (`lib/vote/calendar.ts`).

"Since your last visit" compares the TheDAO asks you last saw, stored in your browser. A new visit starts after more than 30 minutes without a page view.

## Ballot Prep rules

Ballot Prep in My Workspace is an unofficial pre-check of a private draft (`lib/vote/ballot-rules.ts`). TheDAO's official vote app and contract are authoritative. All amounts are integer micro-USD.

1. **Size.** The TheDAO asks of all initiatives on the draft (S + A + B) sum to at least `ceil(1.5 x poolUsd)`. When the asks of all initiatives in the round sum to less than that, the requirement is that sum instead, so a draft holding every initiative passes.
2. **Independence.** S-tier holds at least 3 initiatives that are pairwise unaffiliated: no two of the three share an affiliation group. Initiatives with no groups (every RFP) are unaffiliated with everything.
3. **Group share.** For every affiliation group present in S-tier, `2 x (sum of registered goals of its S-tier initiatives) <= (sum of registered goals of all S-tier initiatives)`. Exactly 50% passes.

Rules 2 and 3 apply to the tiers named by the manifest's `independentTiers` bitmask (bit 0 = S, bit 1 = A); the current round sets `1`, S-tier only. The official app also requires that no tier is left empty while a later tier has picks, and Ballot Prep checks that too. Each failing rule shows a one-line fix.

**Note on rule 1: asks, not goals.** The update specification described rule 1 as "sum of goals of S+A+B >= 1.5 x poolUsd". Ballot Prep checks the sum of **asks** instead, because that is what TheDAO enforces:

- TheDAO's voting post of 17 Nov 2026: "The Initiatives on a ballot must ask for at least 1.5x the value of TheDAO's 400 ETH." ([source](https://paragraph.com/@thedao.fund/voting-is-live-which-security-initiatives-will-make-s-tier))
- The official rules module, `shared/vote/rules.ts` in [BlossomLabs/thedao-initiatives](https://github.com/BlossomLabs/thedao-initiatives/blob/main/shared/vote/rules.ts) (commit `9944ee6`, 26 Nov 2026): "a valid ballot requests (in asks) at least 1.5x the pool (or every project's ask, when donations took that sum below 1.5x the pool)", with the minimum computed as `(3n * round.poolUsd + 1n) / 2n`.
- The contract `vote/contracts/SignedBallots.sol` (`_validateBallot`) counts "each placed project's ask (goal less donations and open pledges) at the block that records the ballot" and reverts with `BallotTooSmall` below the minimum.

Checking goals would report drafts as passing that the contract rejects. Rules 2 and 3 use registered goals, as the official code does.

**Limits of the pre-check.** Asks in Ballot Prep come from the dataset (cents, at the last sync). The contract uses live asks with micro-USD precision at the block that records the ballot, and treats initiatives withdrawn by an admin as asking $0. Results near a boundary can differ.

## Affiliation flags

Two independent signals (`lib/vote/affiliation.ts`). Neither hides or reorders an initiative.

- **Official groups.** "Affiliated with:" lists the other initiatives that share an affiliation group in the manifest. Shown only when the manifest is aligned; otherwise the flag is off and the page says why.
- **My affiliations.** The organizations a holder types in My Workspace are matched in the browser against each initiative's manifest groups, official recipient team, organization names and published aliases (aliases marked anonymous or unconfirmed are excluded). A match shows "You may be affiliated" with the matched text, and Ballot Prep shows "Possibly your own or affiliated" next to the tier choice. Manual marks ("affiliated" or "not affiliated") override the automatic match. Ballot rule 3 counts only the official manifest groups, and the S-tier reminder says so.

Matching rule:

- Text is folded to lower case without accents and split into words at anything that is not a letter or digit. One-character words are dropped.
- An entry is also tried as the text inside and outside its parentheses: "Security Alliance (SEAL)" is tried as itself, "Security Alliance" and "SEAL".
- Official texts are split into name segments (`nameSegments`): the parts inside and outside parentheses, then at commas, semicolons, slashes, and at hyphens in a part without spaces. "Security Alliance (SEAL) Intel" gives "SEAL" and "Security Alliance Intel"; "SEETA, Libp2p" gives "SEETA" and "Libp2p"; "ValOS-Lionscraft" gives "ValOS" and "Lionscraft"; "Safi El-Hassanine" stays one segment.
- A term matches a target when the full texts are equal without punctuation, or when the term names a segment: (1) the term's distinctive (non-generic) words are the segment's first distinctive words, in order; (2) the segment's words before its first distinctive word are in the term ("a", "an" and "the" excepted); (3) every other word of the term is in the segment or optional (the optional words below, or a number such as "911"); (4) when the term adds such a word, the segment adds nothing but connecting words (a, an, and, at, by, for, in, of, on, the, to, with), because two different suffixes mean two names. The reverse (a segment naming the start of the term) counts only when the segment has two or more distinctive words.
- A manifest group that is exactly a name of one organization in the identity table also carries that organization's other names: group "Argot" carries "Argot Collective", and group "SEAL" carries "Security Alliance (SEAL)", "SEAL Security Frameworks" and "Security Alliance (SEAL) Intel". The tag then reads `manifest affiliation group "Argot" (organization name "Argot Collective")`.
- Examples: "SEAL" and "SEAL 911" match "Security Alliance (SEAL) Intel", "Security Alliance" matches all four SEAL initiatives, "Kann" matches "Kann Audits", "Lionscraft" matches "ValOS-Lionscraft", "Blossom Labs Ltd" matches "Blossom Labs", "Nethermind Security" matches "Nethermind", "Remix Project" matches "Remix" and "Kleros DAO" matches "Kleros". "Intel" and "Intel Foundation" do not match "Security Alliance (SEAL) Intel", "Bloom" and "Bloom Network" do not match "Sem Bloom", "Alliance" does not match "Security Alliance", "Runtime Foundation" and "Runtime Verification" do not match "Runtime Capital", "Proof Network" and "Succinct Proof Labs" do not match "Proof of Audits", "Alliance DAO" does not match "Security Alliance (SEAL)" and "Walnut Capital" does not match "Walnut". `tests/unit/affiliation.test.ts` checks these against the published cohort.
- Limits: a single word that starts an official name matches it ("Runtime" matches "Runtime Capital", "Proof" matches "Proof of Audits", "Sem" matches "Sem Bloom"); the tag shows the matched text and the holder can mark it as not affiliated. An entry naming a project that no official text or alias links to its organization (for example "Sourcify" and group "Argot") matches only the texts that contain it.
- Generic words never match on their own. The stoplist (`GENERIC_WORDS`, 60 words, edit it in `lib/vote/affiliation.ts`): a, ag, ai, an, and, association, at, audit, audits, by, capital, co, collective, com, company, cooperative, core, corp, dao, digital, eth, ethereum, for, foundation, fund, gmbh, grant, group, in, inc, io, lab, labs, llc, ltd, network, networks, of, on, open, org, project, protocol, protocols, research, sa, security, software, solutions, studio, systems, team, tech, technologies, technology, the, to, ventures, with, xyz. So "Ethereum Foundation" matches nothing unless an official text is exactly that.
- Optional words may be added (under condition 4) or left out without changing the organization meant (`OPTIONAL_WORDS`, 32 words): a, ag, an, and, at, by, co, com, corp, for, foundation, gmbh, in, inc, io, lab, labs, llc, ltd, network, of, on, org, project, research, sa, security, team, the, to, with, xyz.
- "DAO" (`SAME_NAME_OPTIONAL_WORDS`: dao) may be added only when the official text has no word the entry lacks: "Kleros DAO" matches "Kleros", while "Alliance DAO" matches neither "Security Alliance (SEAL)" nor "Security Alliance". Every other generic word ("Capital", "Ventures", "Protocol", ...) is part of the name when present.

**Public badge-holder directory: not shipped.** The update allowed an optional "Find my public profile" lookup over a bundled list of public badge-holder entries (handle, organizations, expertise), only if a verifiable public source exists. None does. Checked on 26 Nov 2026: thedao.fund/ethsecurity-badges (descriptive text, no list), the thedao.fund home page (names only the curators), `initiatives.thedao.fund` `/api/badge-holders`, `/api/vote/badge-holders`, `/api/holders` and `/api/badge` (all 404), and the BlossomLabs/thedao-initiatives source (it only checks whether a wallet holds the badge NFT). The lookup is shown disabled with that explanation, `BADGE_DIRECTORY` is empty and `BADGE_DIRECTORY_SOURCE` is null (`lib/vote/badge-directory.ts`). This project does not compile such a list itself.

## May interest you

An explained starting set built in the browser from local inputs only (`lib/vote/interest.ts`):

- Focus chips: the 10 official categories (alphabetical) and the 8 AI Lab research modes.
- Typed keywords.
- A category chip matches initiatives with that official category.
- A research mode matches initiatives in its mapped categories, or else whose official title, summary or listed standards contain one of its keywords.
- Keywords match whole words, case-insensitive; a space in a keyword also matches a hyphen. The last word of a keyword may carry one of these endings (`KEYWORD_ENDINGS`): s, es, ed, ing, er, ers. A last word ending in a consonant plus "y" also matches "ies" and "ied". A last word of three letters or more ending in a consonant plus "e" drops the "e" before "ed", "ing", "er" and "ers" ("s" and "es" stay on the full word). So "attack" finds "attacks", "maintain" finds "maintained", "bounty" finds "bounties", "secure" finds "securing" and "decentralize" finds "decentralized"; "audit" does not match "auditor". When the official text uses another form, the reason quotes it: the official summary mentions "attacks" (a form of "attack").
- Groups follow the chip order, then one group per typed keyword. Inside each group the order is alphabetical. An initiative can appear in more than one group.
- Every item states its reason ("Matches your selected focus: X" or "This may interest you because the official title mentions ...") with the matched text, and links to evidence: the official initiative page and, when one exists, an independent source for a supported statement. Items without an evidence link are left out.
- No score, rank or match percentage is computed.

### Research mode mapping (editable)

The single source is `FOCUS_MODE_TABLE` in [lib/vote/interest.ts](lib/vote/interest.ts). Edit it there; the Methodology page and the workspace view read it directly, and `tests/unit/methodology-doc.test.ts` fails if this copy differs.

| Research mode | Official categories | Keywords |
| --- | --- | --- |
| Smart contract auditor (`smart-contract-auditor`) | Audits & Analysis (`audits-analysis`), Formal Verification (`formal-verification`), Fuzzing & Testing (`fuzzing-testing`), Compilers & Languages (`compilers`) | audit, static analysis, fuzzing, formal verification, Solidity, compiler |
| Wallet engineer (`wallet-engineer`) | Wallets & Signing (`wallets-signing`), OpSec (`opsec`) | wallet, signing, clear signing, blind signing, hardware wallet, multisig |
| Infrastructure engineer (`infrastructure-engineer`) | Infrastructure & Clients (`infrastructure`), OpSec (`opsec`), Detection & Response (`detection-response`) | client, node, RPC, monitoring, reproducible |
| Security researcher (`security-researcher`) | Research & Education (`research-education`), Detection & Response (`detection-response`) | threat intelligence, vulnerability, exploit, incident |
| Grant evaluator (`grant-evaluator`) | None (keywords only) | maintenance, maintain, public good, open source |
| Funding analyst (`funding-analyst`) | None (keywords only) | bounty, risk pricing, insurance, pricing |
| Ecosystem researcher (`ecosystem-researcher`) | None (keywords only) | standard, EIP, ecosystem, public data |
| Independent adversarial reviewer (`adversarial-reviewer`) | None (keywords only) | attack, attacker, adversarial, threat model |

## Metric registry

All metrics are defined in [lib/metrics/registry.ts](lib/metrics/registry.ts) and computed in `lib/metrics/compute.ts`. The full definitions (description, source fields, required evidence, update frequency) are on the Methodology page and in `GET /api/v1/metrics`.

| ID | Name | Formula | Missing data |
| --- | --- | --- | --- |
| `cohort.initiatives` | Cohort initiatives | `count(cohort)` | Not applicable |
| `cohort.on_ballot` | Currently on ballot | `count(i where i.onBallot)` | Not applicable |
| `cohort.goal` | Funding requested | `sum goalUsd` | Initiative excluded and flagged |
| `cohort.raised` | Official raised | `sum (summary.pledged + summary.donated)` | Initiative excluded and flagged |
| `cohort.pledged_outstanding` | Outstanding pledges | `sum summary.pledged` | Treated as unavailable |
| `cohort.received_pledges` | Received pledges | `sum summary.received` | Treated as unavailable |
| `cohort.donated` | Confirmed donations | `sum summary.donated` | Treated as unavailable |
| `cohort.thedao_ask` | TheDAO ask (sum) | `sum min(200000, max(0, goalUsd - raisedUsd))` | Unavailable, never 0 |
| `cohort.thedao_pool` | TheDAO pool | `manifest.poolUsd / 10^4` (micro-USD to cents) | Unavailable when the manifest is missing, changed shape, or has sub-cent digits |
| `cohort.remaining` | Remaining funding gap | `sum max(0, goal - raised)` | Initiative excluded and flagged |
| `cohort.milestones` | Milestones | `count(milestones)` | Not applicable |
| `cohort.adoption_milestones` | Adoption milestones | `count(milestones where adoption)` | Not applicable |
| `cohort.adoption_budget` | Adoption-dependent budget | `sum amount where adoption` | Not applicable |
| `cohort.completed_milestones` | Completed milestones | `count(milestones where done)` | Not applicable |
| `cohort.pledge_records` | Pledge records | `count(pledges)` | Not applicable |
| `cohort.top5_backer_share` | Top-5 backer share | `sum top5(backer pledge total) / sum pledge totals` | Unavailable when there are no pledges |
| `cohort.research_coverage` | Research coverage | `count(i where all jobs succeeded) / count(cohort)` | Jobs never run count as not covered |
| `cohort.donations_verified` | Donations verified onchain | `count(verified tx) / count(tx)` | Unchecked transactions count as unverified |
| `initiative.goal` | Goal | `goalUsd` | Not applicable |
| `initiative.raised` | Official raised | `summary.pledged + summary.donated` | Not applicable |
| `initiative.pct_funded` | Funded | `raised / goal` | Unavailable when goal is zero |
| `initiative.thedao_ask` | TheDAO ask | `min(200000, max(0, goalUsd - raisedUsd))` | Unavailable when goal or raised is missing, never 0 |
| `initiative.remaining` | Remaining funding gap | `max(0, goal - raised)` | Not applicable |
| `initiative.donated_share` | Held share of raised | `donated / raised` | Unavailable when nothing is raised |
| `initiative.backers` | Distinct backers | `count(distinct backerId)` | Zero when there are no pledges |
| `initiative.top_backer_share` | Largest backer share | `max(backer total) / sum pledge totals` | Unavailable when there are no pledges |
| `initiative.backer_hhi` | Backer concentration (HHI) | `sum (backer share)^2` | Unavailable when there are no pledges |
| `initiative.self_pledged` | Self-pledged | `sum pledges where backerId = recipient organizationId` | Unavailable when the recipient is not a resolved organization |
| `initiative.milestones` | Milestones | `count(milestones)` | Not applicable |
| `initiative.largest_milestone_share` | Largest milestone share | `max(amount) / goal` | Unavailable when goal is zero |
| `initiative.adoption_share` | Adoption-dependent share | `sum amount where adoption / goal` | Unavailable when goal is zero |
| `initiative.open_questions` | Milestone questions | `sum milestone.questions` | Not applicable |
| `initiative.evidence_coverage` | Evidence coverage | `count(status in {independently_verified, partially_supported}) / count(material and status not in {future_target, officially_reported, not_applicable})` | Unavailable when there are no verifiable present-tense claims |
| `initiative.repos_public` | Public repositories cited | `count(cited repos where exists)` | Zero when none are cited |
| `initiative.repos_active_90d` | Repositories with commits in 90 days | `count(repos where commitsLast90d > 0)` | Repos with unknown activity are not counted |
| `initiative.repos_with_ci` | Repositories with CI workflows | `count(repos where hasCiWorkflows)` | Unknown counts as not present |

Repository activity, reachability and counts describe what exists publicly. They are not measures of security quality.

## Round 1 history

Every dossier (section 8) and every organization profile shows whether the team or organization received funding in TheDAO / Giveth Round 1, the Ethereum Security QF round of April 23 to May 14, 2026. The data comes from [lib/intelligence/round1.ts](lib/intelligence/round1.ts) (matching) and [research/round1.ts](research/round1.ts) (retrieval). It is labeled "Independent evidence": the TheDAO transparency report is not part of the official initiatives API.

**Retrieval.** No public dataset or documented API publishes the per-project results, so only the two named pages are used, retrieved with `npm run research -- round1` (also part of `npm run research`):

- [thedao.fund/transparency](https://thedao.fund/transparency): the server-rendered HTML has the "Who we funded" table (recipient, total in ETH, USD when sent, progress update link) and the page totals. The page's route module (`/assets/route-<hash>.js`, found through the import in the inline module script) embeds the report's CSV with the header `project_name,matching_pool,extra_round_inflow,other_donors,other_donors_usd,total,usd_sent,link,progress_update`. The collector requires that header and exactly 135 rows, the same check the site itself runs, and refuses to store anything else, so a partial list is never published. Every CSV row is cross-checked against the table row with the same name (website, progress link, total and USD for rows without a direct grant). The same module lists direct grants (amount, USD value, transaction hash) and live Superfluid streams for "SEAL 911" and "SEAL"; their table totals include the stream, so the displayed value is stored with the date it was read. Per-project pages are `thedao.fund/transparency/<slug>` (name normalized with NFKD, accents removed, lowercased, other characters replaced by "-").
- [Giveth forum results topic](https://forum.giveth.io/t/ethereum-security-qf-round-results-april-23-may-14-2026/2201), read as Discourse JSON (`/t/2201.json`): round-level facts only. The round period comes from the topic title, the number of eligible projects (134) from the first post, the distribution announcement date (June 9, 2026) and its four transaction links from the second post, and the progress update posts from the posts after it.
- Checked and not used: the full per-project results linked from the forum are in a private Google Sheet and in images. The Giveth GraphQL API (`mainnet.serve.giveth.io/graphql`, QF round 16) lists 132 projects, not 134, and its donor counts are lifetime or active-round values, not Round 1 values.

Raw responses are stored content-addressed (sha256) in `data/external/round1/` with a manifest of URL, retrieval time, hash and method. The truth audit re-parses them offline: every published amount, link, displayed total, grant and forum fact must equal the raw copy, the record count must be 135, and the match lists must equal a fresh run of the matcher. When a fetch fails, the previous copy is kept and marked stale, and the page says when it was retrieved.

**Matching.** One function (`computeRound1Matches`) runs for every initiative and every organization. A record is shown as a match only with one of these stated reasons:

1. The official proposal links to the record's `thedao.fund/transparency/<slug>` page, or to the Giveth project page whose slug is the record's name (same project).
2. Same website: the host (lowercase, without "www.") of the record's website equals the host of the recipient URL, the organization website or another official recipient URL of the same organization. The same non-root page means the same project; the same host means the same organization. Shared hosts never match on the host alone (`SHARED_HOSTS`): github.com, x.com, twitter.com, giveth.io, qf.giveth.io, medium.com, mirror.xyz, paragraph.com, substack.com, notion.site, docs.google.com, linktr.ee, youtube.com, youtu.be, discord.gg, discord.com, t.me, etherscan.io, huggingface.co, linkedin.com, farcaster.xyz, warpcast.com, gitlab.com, eth.limo, vercel.app, pages.dev, github.io, gitbook.io, hackmd.io, forum.giveth.io, thedao.fund. On GitHub the same owner (organization) or owner and repository (project) is required, on X or Twitter the same account.
3. Same organization name: an official name, or a name the curated alias table (`data/curated/aliases.json`) records for the same organization, equals the record's name after normalizing case and punctuation, or the part before ":", " - " or " | ", or either side of " by ".

When only a distinctive word appears in both names (or in the record's own website host), the record is shown as "Possible match: please verify" with both links. Generic words never count (`GENERIC_TOKENS` in `lib/intelligence/round1.ts`, for example security, ethereum, open, audit, safe, wallet, protocol and labs; words shorter than four letters, such as "ai", never count either). Links in the proposal text to other websites are not used for matching, because proposals also cite third-party projects; such a link is added only as a note to a possible match. Similarly named entities are never treated as the same. Records are listed alphabetically by Round 1 project name. An organization profile lists the records found for the organization and for each of its initiatives.

**Display.** Per record: the project name linked to its transparency page, the amount received in ETH with the USD value when sent, its breakdown (TheDAO matching pool, community-raised matching, direct donations, direct grants), the round period and the distribution announcement as the date, the progress update link (blank when none is listed), the reason, the source label and the checked-on date. Without a record the text is "No Round 1 funding found in the sources checked." No performance judgment is made.

**Limitations.** The CSV is read from a hashed script bundle, which is not a stable public API and may change or disappear. The sources publish no per-project payment date and no per-project donor count, so neither is shown. Displayed totals with a live stream change over time. Matching is conservative: a renamed team, or one listed under a different website, may appear only as a possible match or not at all.

## Evidence card

Every dossier opens with an evidence card, and every Research row carries a one-line summary of it. The card is built by `buildEvidenceCard` in [lib/intelligence/evidence-card.ts](lib/intelligence/evidence-card.ts) from the official record (`recipientTeam`, `recipientUrl`, `links`, `textLinks`, `pledges`, funding figures) and the stored research results (repositories, products, HTTP checks, GitHub profiles, people, prior-funding statements and Round 1 matches). It makes no network request when a page loads.

**Layout.** The same six sections, in the same order, for all 55 initiatives: Shipped work, Funding, Prior funding, Team and track record, Audits or reviews, Not found. An empty section reads "Not found". Every item has one of the four source labels, a source link and "checked on <date>": the retrieval time of the official record for official fields and proposal links, the GitHub API check time for repositories, and the HTTP check time for sites. RFPs use the same card; their team section reads "No designated recipient".

**Shipped work.** The official site (`recipientUrl`) with its reachability check, the sites and products the research pipeline found on the recipient's domain, and every repository the proposal links, with last push, latest release and release count, license and archive state from the GitHub API. A repository is marked "Owner matches the recipient's GitHub account" only when the identity rules recorded that link, otherwise "Cited in the proposal". The commit count in the 90 days before the check is a raw fact; GitHub stars and commit counts do not measure security quality, and stars are not shown.

**Funding.** Pledged (outstanding), received pledges and donated (confirmed) are three separate official figures. Received pledges are already inside donated, so they are never added together. Every pledge is listed with the backer name as recorded, its amount and status.

**Self-pledge rule.** "Backer name overlaps team name (possible self-pledge, unverified)" appears when the backer name, after folding case and accents and turning punctuation into spaces, equals the official recipient team or a recorded name of the recipient organization, or contains one as a whole-word sequence. Names shorter than three letters or digits are ignored. "Safe" does not match "SafeGuard", and "Nethermind" does not match a team called "Nethermind Security". The rule is one exported function (`possibleSelfPledge` in [lib/intelligence/self-pledge.ts](lib/intelligence/self-pledge.ts)). A flag is a prompt to check, not a finding.

**Prior funding.** A link to the Round 1 history section with the number of records and whether they are matches or possible matches, plus the prior-funding statements found in the proposal, labeled "Applicant statement".

**Team and track record.** Public profiles linked from the proposal's team section and the other links in that section, and the recipient organization's GitHub account when the pipeline checked it. Email addresses, phone numbers and messenger links (`mailto:`, `tel:`, t.me, wa.me, Signal, Discord user pages) are never shown, including when they appear in link text.

**Audits or reviews.** Only proposal links whose address or link text names an audit or security review report (for example "audit-reports", "audit-summary", "security review", or an `/audits` page). Each reads "Linked in the proposal. Which work the report covers was not verified." Without such a link the section reads "Not found".

**Not found.** What was searched and not found, for example "No links published in the proposal", "No official site in the official record", "No public repository linked", "No release published", "No license file detected", "No named backers in the official record", "No Round 1 funding found in the sources checked" and "No public audit report linked".

**Broken links and caching.** A link whose stored check failed is flagged "Link did not respond when checked on <date>" with the HTTP status; a repository the GitHub API did not return is flagged "Repository not found when checked on <date>". Neither is hidden. HTTP 403, 429 and 503 (bot protection or rate limits) and network errors make a check inconclusive: the card then says so and shows the cached result with its age at publication. All checks are cached results of the research run (`data/research/cache`, `data/research/results`) and are not refreshed when the page loads.

**Audit.** The truth audit (check 13) recomputes every card: same section keys and order, an http(s) source and a checked-on date on every item, funding figures and backers equal to the raw official record, repository facts equal to the stored GitHub results, product flags equal to the stored checks, self-pledge flags recomputed by an independent implementation, no private contact detail, and "Not found" items consistent with the data.

## Briefing and reading time

Every dossier has a 10-minute briefing built by `buildBriefing` in [lib/intelligence/briefing.ts](lib/intelligence/briefing.ts) from the published dataset. It runs no model and writes no prose. The order is the same for every initiative; an item is left out when its source data is missing: summary, proposal sections quoted verbatim (`why`, `in_scope`, `out_scope`, then milestones with criteria, then `commitments` and `team` for grants or `existing`, `who` and `hard_req` for RFPs), links, Round 1 history (only with matches) and the evidence card. The official grant section `why_grant` is not in the requested order; the dossier names it under "Other official sections not in this order".

**Reading time** is the number of words divided by 200 words per minute, rounded up to whole minutes, with a minimum of 1 minute per item. The total is the sum of the item times. Words are whitespace-separated tokens that contain a letter or digit, after link syntax and Markdown markers are removed; a bare URL counts as one word. An item is marked Optional when the items before it already add up to 10 minutes or more; the item that crosses minute 10 is not Optional. Across the 55 initiatives the total is 9 minutes at minimum, 21 at maximum and 12 at median.

**Link types** come from the URL alone, never from link text. Precedence: audit (a path segment such as `audit`, `audits` or `audit-reports`, a PDF named for an audit, or a host starting with such a word), repo (github.com, gitlab.com, bitbucket.org or codeberg.org with owner and repository), demo, docs, website (an address with no path on a host that is not a social, chat, video, document or explorer service), then "Link". Email, phone and messenger links are left out. Every item has at least one https source.

**Read marks and focus chain.** "Mark as read" is stored in the browser in `esi.workspace` under `briefingRead`. "Briefing for all in my focus" (`/workspace/briefing`) uses the same focus chips and keywords as May interest you, lists each matching initiative once, alphabetically by official title, with the total time. The server sends every briefing and the browser decides which to show, so the focus is never sent. `GET /api/v1/initiatives/:id/briefing` returns the same briefing.

**Offline.** The briefing needs no request after the page loads, and read marks are local. The site has no service worker, so a page works offline only when the browser holds it in its own cache. This part of the requirement is partially met.

## Review progress and change detection

Review progress is a private checklist ([lib/workspace/progress.ts](lib/workspace/progress.ts)). It is not a score and not a ranking.

- **States.** Not started (default), Reading, Reviewed (the published record at that moment is stored with the mark) and Revisit. Revisit is set only by the site, when the record changed after the Reviewed mark, with a reason such as "New revision 3; 2 new comments". It is never offered by hand. A counter shows "You've reviewed N of M".
- **Since your last visit.** The server builds one feed entry per initiative from the published dataset: the latest fetched revision number, the official `commentCount` and the change records in the dataset. The browser keeps the record it saw (`visit.seen`); when the previous page view is more than 30 minutes old, it becomes `visit.baseline`. A change is reported only when the record differs: a change id not in the stored snapshot, a higher revision number or a higher comment count. Comment text is neither stored nor shown. The first visit has no baseline and lists nothing. The list is alphabetical.
- **Export.** Markdown, CSV and JSON ([lib/workspace/export.ts](lib/workspace/export.ts)), written in the browser. Every file carries the dataset version and publication time and source URLs. CSV cells that start with `=`, `+`, `-`, `@`, tab or carriage return get a leading apostrophe. The JSON file is a normal workspace export, so Import restores it exactly after validation (`parseImport`).
- **No network.** Edits, exports and imports make no request. "Clear all my data" removes every local storage key that starts with `esi.`.

## AI interpretation and "Not yet researched"

The site runs no AI model. The label rules apply to any generated text that is displayed: published claims with origin `ai` (none in the current dataset) and text pasted into the AI Lab result reader ([lib/ai/interpretation.ts](lib/ai/interpretation.ts)).

- Every such statement carries the label "AI interpretation", its http(s) citations and its provenance (model, prompt version, number of sources examined, verification status "Not verified" or "Checked by the reviewer, not independently verified").
- Text without a citation is not shown; the underlying evidence is listed instead, or "Not yet researched" when there is none. "Not yet researched" means no research has run, never a negative finding, and the display lists what is missing.
- The Item 1 filter (`filterAiOutput`) runs before display. A blocked statement, for example advice to fund an initiative, is replaced by the raw evidence and the filter notice.
- No confidence, score or probability exists in any AI type, schema or component.
- Claims with origin `ai` are never treated as applicant statements or evidence, and are excluded from the "material without independent support" list ([lib/intelligence/unsupported-material.ts](lib/intelligence/unsupported-material.ts)).
- External content is untrusted data: it is rendered as plain text, never as HTML or Markdown, and never followed as instructions. Briefs for the reader's own assistant are built from configuration only, and the section "Untrusted content and prompt injection" is identical for every configuration.

## Organization identity

`lib/domain/identity.ts` resolves backer and recipient names into organizations:

- `exact_normalized`: identical after normalizing case and punctuation.
- `same_official_domain`: official records link to the same website domain or GitHub owner.
- `curated_with_evidence`: matched by a researcher with cited sources (`data/curated/aliases.json`).
- `candidate_unconfirmed`: similar names without evidence. Kept separate and shown as "not confirmed as the same entity".
- `anonymous_not_merged`: anonymous or individual labels. Never merged.

A self-pledge is a pledge whose backer resolves to the initiative's own recipient. It is listed for transparency like every other self-pledge.

## Security lifecycle taxonomy

Eleven stages (`lib/domain/taxonomy.ts`), informed by the Ethereum Foundation's [Trillion Dollar Security](https://ethereum.org/reports/trillion-dollar-security/) overview: Development; Testing & verification; Deployment & supply chain; Transaction construction; Signing & wallets; Runtime & protocol execution; Monitoring; Threat detection & intelligence; Incident response & disclosure; Recovery; Infrastructure & operational security. An initiative maps to a stage when one of its official categories is a hint for that stage, or when its proposal text contains at least two distinct stage terms with three or more matches in total (whole words). At most four stages per initiative.

## Relationship hypotheses

`lib/intelligence/overlap.ts` (`overlap@1`) computes TF-IDF cosine similarity between initiatives plus shared stages, standards, repositories and backers. Pairs above the thresholds in `OVERLAP_THRESHOLDS` become "potentially overlaps" or "potentially complements" hypotheses. They are drawn dashed, labeled as hypotheses and never state a partnership, duplication or agreement.

## Similar initiatives

`lib/intelligence/similar.ts` (`similar@1`) finds initiatives that may address the same problem, with the evidence for each pair. It does not replace the comparison view; "Compare these" opens `/research/compare?ids=<a>,<b>` with both initiatives selected. It is separate from the relationship hypotheses above and runs on request from the published dataset (nothing is stored). There is no model and no score: the same dataset always gives byte-identical output, whatever the order of its records.

**Signals.** For every pair of the 55 initiatives:

- Shared official category (weak): the initiatives share at least one official category.
- Shared affiliation group (strong): both are in the same affiliation group of TheDAO's vote manifest (only when the manifest alignment is confirmed).
- Shared phrases (strong from 2 phrases, weak with 1): two-word phrases that both proposals use in their official `why` and `in_scope` sections. Text is split into sentences (Markdown formatting removed), then into chunks at punctuation; a phrase is two adjacent words of at least three letters, neither a stopword nor starting with a digit. A phrase made only of generic words is dropped, as are proposal boilerplate phrases, technology names (reported once, as technologies) and phrases used by more than 5 initiatives (`SIMILAR_THRESHOLDS`). The shared phrases are listed on the pair.
- Shared standards or technologies (strong): ERC, EIP and RIP numbers (ERC-n and EIP-n are the same number) and named technologies that both proposals name in the same two sections. Names match case-sensitively as whole words, so "safe" the adjective, "Safe Harbor" and "ZKsync" do not match "Safe" or "ZK". "Safe" at the start of a sentence counts only when the next word names the product ("Safe owners", "Safe{Wallet}").
- Shared public backer (strong): a backer that pledged to both in the official pledge records. Anonymous backers are excluded.

Team, out-of-scope, commitments and other sections are not read, so a tool a team built before or a technology that is out of scope never counts.

**Visible pairs.** A pair is shown only when it has a phrase or technology signal (so it always has text evidence) and is more than one weak signal: at least one strong signal, or at least two weak signals. A pair that matches on only one weak signal, for example one shared category or one shared phrase, is hidden.

**Labels.** "Same organization" when both initiatives have the same recipient organization (never shown as overlap); otherwise "Possible overlap" when they share an official category, and "Possible complement" when they do not. RFPs have no recipient organization and follow the same rules. Every pair reads "This is a research hypothesis, not a finding". The words "duplicate" and "waste" are never used (unit test).

**Evidence.** Every pair lists its signals. Each phrase or technology signal quotes one sentence from each proposal, the sentence of the `why` or `in_scope` section with the most of the shared terms (the earliest one on a tie), verbatim with Markdown formatting removed, labeled "Applicant statement" and linked to the official initiative page at that section.

**Order.** Dossier lists are "Alphabetical (neutral)" by the other initiative's title. No score, similarity value or percentage is computed or shown.

**AI hypotheses.** None are generated; the site runs no model. If they are added later, they must cite proposal text, pass the neutral-language filter and carry the "AI interpretation" label.

**Equal treatment.** The Proof of Audits initiative goes through the same function with the same rules; a unit test runs it under a neutral id and organization and gets the same pairs and signals.

**Word lists.** Edit them in `lib/intelligence/similar.ts`; a unit test keeps this copy equal to the code.

- Stopwords (`KEYWORD_STOPWORDS`, 243 words): a, about, above, across, after, again, against, all, almost, also, although, always, among, an, and, another, any, are, around, as, at, away, back, be, because, been, before, being, below, between, both, but, by, can, cannot, could, did, do, does, doing, done, down, during, each, either, else, even, ever, every, few, for, from, further, get, gets, getting, had, has, have, having, here, how, however, if, in, into, is, it, its, itself, just, less, like, made, make, makes, making, many, may, more, most, much, must, near, need, needs, never, new, next, no, nor, not, now, of, off, often, on, once, one, only, onto, or, other, others, our, out, over, own, per, perhaps, rather, really, same, several, shall, should, since, so, some, still, such, than, that, the, their, them, themselves, then, there, these, they, this, those, though, through, thus, to, too, two, under, until, up, upon, us, use, used, uses, using, very, via, was, way, ways, we, well, were, what, when, where, whether, which, while, who, whom, whose, why, will, with, within, without, would, yet, you, your, three, four, five, first, second, third, last, least, able, already, approve, approved, assess, based, better, billion, come, comes, companion, current, currently, dollar, dollars, etc, help, helps, helping, identify, include, includes, including, keep, keeps, kept, million, outside, potential, propose, proposed, provide, provides, providing, real, relevant, result, resulting, results, routine, run, running, runs, simple, thousand, trillion, applicant, fund, funded, funding, grant, grants, initiative, initiatives, milestone, milestones, proposal, proposals, rfp, rfps, thedao.
- Generic words (`GENERIC_KEYWORD_WORDS`, 36 words): audit, audits, available, code, community, contract, contracts, developers, ecosystem, eth, ethereum, existing, independent, independently, mainnet, open, project, projects, protocol, protocols, public, research, review, security, smart, source, support, team, teams, tool, tools, user, users, verification, verified, work.
- Boilerplate (`BOILERPLATE_PHRASES`): adoption work, below follow, complete freedom, ethereum foundation, final milestones, funded work, grant funds, grant pays, hard requirements, milestone reviewer, milestones below, possible approach, requirements below, rfp pays, selected team, starting point, thedao security, security fund.
- Named technologies (`TECHNOLOGIES`): Aderyn, Besu, Blockscout, Certora, Clear Signing, Echidna, Erigon, Foundry, Geth, Gigahorse, Halmos, Hardhat, hevm, Kontrol, Lean 4, Ledger, libp2p, Lighthouse, Lodestar, Medusa, MetaMask, Mythril, Nimbus, Prysm, Rabby, Remix, Reth, Safe, Semgrep, Slither, Sourcify, TEE, Teku, Trezor, Vyper, Wake, ZK.

**Limitations.** Phrases are exact two-word matches without stemming, so "hardware wallet" and "hardware wallets" are different phrases. A proposal that names a technology only as an incident example (for example a Safe incident) counts the same as one that builds on it; the quotes show which. The lists cover the technologies named in this cohort and are not complete.

## Open questions

`lib/intelligence/open-questions.ts` (`open-questions@1`) turns structural gaps in the official record into neutral questions a holder can investigate. A question is not an accusation and not a finding that something is wrong; the dossier and the aggregate view say so. The rules read only official fields (and, for rule 8, the claims pipeline's classification of proposal sentences). Nothing is generated by a model, and every rule has one fixed template, so the wording is the same for every initiative, Proof of Audits included. Questions are computed on request from the published dataset and are not stored.

| # | Rule | Field | Category | Template |
| --- | --- | --- | --- | --- |
| 1 | Milestone without a target date | `milestones[].targetMonth` | Timeline | Is there a target date for milestone {n}? |
| 2 | RFP without a recipient team | `recipientTeam` | Delivery | Who is expected to deliver? |
| 3 | No repository or product link | `links`, `textLinks` | Evidence | Is there a public repository or product link for this work? |
| 4 | Adoption milestone that names a third party | `milestones[].adoption`, `milestones[].criteria` | Adoption | Has any party named in milestone {n} confirmed the adoption it describes? |
| 5 | Backer name overlaps the recipient team | `pledges[].company`, `recipientTeam` | Funding | Can the team confirm whether the pledge from {company} is a self-pledge? (possible self-pledge, unverified) |
| 6 | Pledged, not yet received | `pledges[].status` | Funding | Is there an expected date for the pledged amount from {company} to be received? |
| 7 | No named milestone reviewer | `milestoneReviewer` | Delivery | Who will review the milestones? |
| 8 | Statement about existing functionality without a link | claims (kind `integration`, status `applicant_reported`) | Evidence | Is there a public link that shows the quoted statement? |

**Details.**

- Rule 1 does not ask about milestones marked complete. The milestone name is quoted below the question.
- Rule 3 counts a link to a GitHub, GitLab, Codeberg or Bitbucket repository (owner and repository in the path) or a link on the recipient's own domain: the domain of the official recipient URL or organization website, or a domain whose name equals the recipient name or one of its distinctive words ("owney.app" for Owney). The linked domains are listed with the question.
- Rule 4 reads the acceptance criteria of open adoption milestones. A party is a name in an enumerated list ("from this list: MetaMask, Rabby, Trust Wallet", "(Tenderly, Foundry, Hardhat)"), or a name from such lists anywhere in the cohort or from a distinctive organization name, mentioned on its own (case-sensitive, whole words). Names after "outside", "excluding", "independent of", "other than", "beyond", "none of them" or "not counting" and the recipient's own names are left out. Never counted as parties (`NOT_A_PARTY`): Ethereum, Ethereum L2, Ethereum L2s, Ethereum mainnet, L1, L2, L2s, L2BEAT, ETH, DeFi, AI, CEX, TVL, EIP, ERC, CI, CI/CD, Linux, GitHub, API, SDK, MCP, SKILL, CAR, TEE, ZK, RPC, UI, IDE, Enterprise, USD, plus numbers, amounts and dates. Counted only inside a list (`LIST_ONLY_NAMES`): Safe, Base, Ink, Sky, Curve, Lighter, Keeper, Rainbow, Phantom, Foundry, Remix, Medusa, Compound, Across, Synapse, Delay, Roles, Seer, Walnut, Everything, Unlink. The criteria that name the parties are quoted.
- Rule 5 uses `possibleSelfPledge` from `lib/intelligence/self-pledge.ts`, the same conservative whole-word name check as the evidence card ("Safe" never matches "SafeGuard"). The question carries "(possible self-pledge, unverified)".
- Rule 6 asks once per official pledge record with status `pledged`.
- Rule 8 reads statements the claims pipeline classified as existing integrations or production use (planned work is status `future_target` and is excluded) in the `why`, `why_grant`, `team`, `existing` and `details` sections, whose sentence has no URL and no link written out with a path, and that have no supporting evidence. The statement is quoted as an applicant statement.

**Order and ids.** Dossiers list questions by category (Timeline, Delivery, Funding, Adoption, Evidence), then rule number, then the milestone index or record order. Each question has a stable id (`stableId("oq", rule, initiative, record)`), so marks survive republishing.

**Local tracking.** "Mark as asked or resolved" stores the question id and the time in the browser under `esi.workspace` (`openQuestions`). "Copy as list" copies a plain-text list (question, category, source link) to the clipboard. The app never sends questions to anyone; a unit test scans this feature's files for email, messaging and POST requests.

**Aggregate view.** `/research/questions` lists the counts per category for all 55 initiatives, "Alphabetical (neutral)" by title. A count is not a measure of quality: an initiative with more milestones or pledges has more records the rules can ask about.

**Earlier question rules.** The dossier keeps the blind-spot and milestone questions under "Other questions from the evidence rules", except those the open-question rules already ask: the milestone question about a missing target month (rule 1), the adoption questions for milestones that rule 4 covers, and unconfirmed-integration questions for statements that rule 8 covers.

**Limitations.** Rule 4 finds a party only when the criteria name it in a list or the name is known from such a list or an organization name; a party named once in running text with a name unknown to the cohort is not found. Rule 3 does not open the links, so a third-party page that happens to show the work counts as no product link.

## Milestone questions and blind spots

Milestone rules raise questions, not failures: no or very short acceptance criterion, adoption milestones without confirmed adopters, open milestones without a target month, more than half of the budget in one milestone, completion without a linked artifact, numeric adoption targets. Missing data is a reason to ask, never an accusation.

## Equal treatment

Proof of Audits builds this site and has an initiative on this ballot. The same templates, wording, research requirements and evidence standards apply to it as to every other initiative.

- `tests/unit/equal-treatment.test.ts` scans the code for any mention of Proof of Audits (name, slug, organization id). Engine code (`lib/intelligence`, `lib/metrics`, `lib/api`, `lib/db`, `lib/corrections`, `research`, `components/research`, `components/ui`, `components/graph`, `app/api`) must contain none. Elsewhere each mention is listed with a reason, and no line that selects it may contain sort, rank, score, weight, boost, priority, order, pin, feature or highlight. A parity test over all 55 dossiers checks identical sections, evidence rules, verification methods, research tasks and correction support.
- `isCoiOrganization` in `lib/disclosure.ts` is the only way to select Proof of Audits, and only to show a disclosure.
- A banner on every page reads: "Built by Proof of Audits, which has an initiative on this ballot. Unofficial tool. It never sees your vote. Every initiative is treated the same."

## Privacy

The Methodology page lists the same items, and `tests/unit/privacy.test.ts` checks them against the code.

- **Stored only in your browser** (local storage): `esi.workspace` (My Workspace, including the Ballot Prep draft, the TheDAO asks you last saw, your affiliations and marks, your May interest you chips and keywords, the open questions you marked as asked or resolved, your review progress states and reasons, the record last seen for "Since your last visit", and your briefing read marks), `esi.lab.templates` (AI Lab templates), `esi.theme` (theme).
- **Stored on the server:** the public dataset; corrections you choose to submit; an optional private contact on a correction, encrypted with AES-256-GCM, never returned by the API or MCP, deleted 30 days after submission at the latest; an HMAC-SHA-256 of the submitting network address to limit submissions to five per hour; error logs with a fixed event name and error type only.
- **Never stored:** votes, ballots, wallet addresses or signatures (the site never connects a wallet); search text; AI Lab prompts and briefs (built in the browser); workspace contents; analytics, tracking cookies or third-party requests.

## Neutral language

See [NEUTRAL_LANGUAGE.md](NEUTRAL_LANGUAGE.md) (version `2026.11-v1`): allowed framing, banned phrases, the four source labels (Official data, Applicant statement, Independent evidence, AI interpretation), the "Not found" rule, official quotations and the enforcement by lint, runtime filter and skill builder.

## Limitations

- The cohort is frozen (`data/cohort.json`); later ballot changes are flagged, not applied.
- Automated research sees only public sources. "Not found" is not a negative finding.
- Ballot Prep and the TheDAO ask are computed from the last sync, not live onchain values.
- Hypotheses and what-if scenarios are exploration, not predictions.
- The briefing works offline only from the browser's cache because the site has no service worker.
- Review progress lives in one browser; clearing browser storage removes it. Comments are detected only through the official comment count.
- Similar initiatives shows hypotheses from text signals only; optional AI hypotheses were not shipped.
- Round 1 records come from a hashed script bundle on thedao.fund, not from a documented API; per-project dates and donor counts are not published.
